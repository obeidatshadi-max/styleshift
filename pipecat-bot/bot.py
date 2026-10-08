import asyncio
import json
import os
import time
from datetime import datetime, timezone

import httpx
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    EndFrame,
    EndWorkerFrame,
    OutputTransportMessageUrgentFrame,
    TranscriptionFrame,
    TTSSpeakFrame,
    VADUserStartedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineWorker
from pipecat.processors.audio.vad_processor import VADProcessor
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.runner.types import DailyRunnerArguments
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.transports.daily.transport import DailyParams, DailyTransport
from pipecat.workers.runner import WorkerRunner

TURN_CAP = 5  # mirrors voice-partner-core.ts TURN_CAP — the server is
# the source of truth for the actual cap; this is only a client-side
# sanity bound on how many turns this process expects to run.

# nova-3 is English-only; Arabic needs nova-2's broader language coverage.
DEEPGRAM_MODEL_BY_LANG = {"ar": "nova-2-general", "en": "nova-3-general"}


def _iso(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).isoformat()


class VoicePartnerJudgeProcessor(FrameProcessor):
    """Replaces the usual LLM node. On each final transcript, calls back
    into the existing Next.js /turn route (all persona/guardrail/judge
    logic lives there, unchanged) and pushes the doctor's reply as a
    TTSSpeakFrame, instead of ever calling an LLM directly."""

    def __init__(self, session: dict):
        super().__init__()
        self._session = session
        self._history: list[dict] = [{"role": "doctor", "text": session["openingText"]}]
        self._state = session["state"]
        self._clear_steps_hit: list[str] = []
        self._turn_count = 0
        self._rep_speech_started_at: float | None = None
        self._pending_doctor_turn_index: int | None = None
        self._doctor_speech_started_at: float | None = None
        self._client = httpx.AsyncClient(
            base_url=session["turnCallbackBaseUrl"],
            headers={"authorization": f"Bearer {session['botToken']}"},
            timeout=30.0,
        )

    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, VADUserStartedSpeakingFrame):
            self._rep_speech_started_at = time.time()
        elif isinstance(frame, BotStartedSpeakingFrame):
            self._doctor_speech_started_at = time.time()
        elif isinstance(frame, BotStoppedSpeakingFrame):
            await self._report_doctor_timing()

        if isinstance(frame, TranscriptionFrame) and frame.text.strip():
            await self._handle_rep_turn(frame.text.strip())
            return  # don't forward the raw transcription frame further

        await self.push_frame(frame, direction)

    async def _report_doctor_timing(self):
        """Fires once the doctor's TTS line finishes playing — the only point
        both start and end are known for that turn (see turn/route.ts's
        comment on why this can't be included in the /turn POST itself)."""
        if self._pending_doctor_turn_index is None or self._doctor_speech_started_at is None:
            return
        ended_at = time.time()
        try:
            await self._client.post("/api/voice-partner/turn-timing", json={
                "sessionId": self._session["sessionId"],
                "turnIndex": self._pending_doctor_turn_index,
                "startedAt": _iso(self._doctor_speech_started_at),
                "endedAt": _iso(ended_at),
            })
        except Exception:
            pass  # best-effort, never blocks the pipeline (matches turn/route.ts's insert tolerance)
        self._pending_doctor_turn_index = None
        self._doctor_speech_started_at = None

    async def _handle_rep_turn(self, rep_text: str):
        await self._broadcast({"type": "rep_text", "text": rep_text})
        rep_started_at = self._rep_speech_started_at
        rep_ended_at = time.time()
        self._rep_speech_started_at = None

        form = {
            "doctorId": self._session["doctorId"],
            "sessionId": self._session["sessionId"],
            "lang": self._session["lang"],
            "history": json.dumps(self._history),
            "repText": rep_text,
            "objectionType": self._session["objectionType"],
            "state": json.dumps(self._state),
            "clearStepsHit": json.dumps(self._clear_steps_hit),
        }
        if rep_started_at is not None:
            form["repStartedAt"] = _iso(rep_started_at)
            form["repEndedAt"] = _iso(rep_ended_at)
        # No `audio` field at all — the /turn route only requires one
        # when `repText` is absent.
        resp = await self._client.post("/api/voice-partner/turn", data=form)
        if resp.status_code != 200:
            await self._broadcast({"type": "error", "stage": "turn", "status": resp.status_code})
            return

        data = resp.json()
        # Two rows were just inserted server-side at turn_index = baseIndex
        # (rep) and baseIndex + 1 (doctor) — baseIndex is len(self._history)
        # at POST time, mirroring turn/route.ts's own baseIndex computation
        # exactly, since history is the same array just sent in this request.
        self._pending_doctor_turn_index = len(self._history) + 1
        self._history.append({"role": "rep", "text": rep_text})
        self._history.append({"role": "doctor", "text": data["doctorText"]})
        self._state = data["state"]
        self._clear_steps_hit = list(set(self._clear_steps_hit) | set(data["clearSteps"]))
        self._turn_count = data["turnCount"]

        await self._broadcast({
            "type": "doctor_text", "text": data["doctorText"],
            "outcome": data["outcome"], "turnCount": self._turn_count,
            "clearSteps": self._clear_steps_hit, "state": self._state,
        })
        await self.push_frame(TTSSpeakFrame(data["doctorText"]))

        if data["outcome"] != "continue":
            await self._resolve_session(data["outcome"])

    async def _resolve_session(self, outcome: str):
        await self._client.post("/api/voice-partner/session-result", json={
            "doctorId": self._session["doctorId"],
            "sessionId": self._session["sessionId"],
            "objectionType": self._session["objectionType"],
            "outcome": outcome,
            "clearSteps": self._clear_steps_hit,
            "turnCount": self._turn_count,
            "difficulty": self._session.get("difficulty"),
        })
        await self._broadcast({"type": "outcome", "outcome": outcome, "state": self._state})
        await asyncio.sleep(2)  # let the final TTS line finish playing
        await self.push_frame(EndWorkerFrame())

    async def _broadcast(self, message: dict):
        # Raw Daily app-message (not RTVI-wrapped) — the browser client
        # listens on Daily's data channel directly, per the design spec.
        await self.push_frame(OutputTransportMessageUrgentFrame(message=message))


async def bot(args: DailyRunnerArguments):
    session = args.body
    lang = session["lang"]

    transport = DailyTransport(
        args.room_url, args.token, "AI Doctor",
        DailyParams(audio_in_enabled=True, audio_out_enabled=True),
    )
    stt = DeepgramSTTService(
        api_key=os.environ["DEEPGRAM_API_KEY"],
        settings=DeepgramSTTService.Settings(
            model=DEEPGRAM_MODEL_BY_LANG.get(lang, "nova-3-general"),
            language=lang,
        ),
    )
    tts = ElevenLabsTTSService(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        settings=ElevenLabsTTSService.Settings(
            voice=os.environ["ELEVENLABS_VOICE_ID"],
            model="eleven_turbo_v2_5",
            language=lang,
        ),
    )
    judge = VoicePartnerJudgeProcessor(session)

    vad = VADProcessor(vad_analyzer=SileroVADAnalyzer())
    pipeline = Pipeline([transport.input(), vad, stt, judge, tts, transport.output()])
    worker = PipelineWorker(pipeline)

    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(_transport, _participant):
        await worker.queue_frame(TTSSpeakFrame(session["openingText"]))
        await worker.queue_frame(OutputTransportMessageUrgentFrame(message={
            "type": "doctor_text", "text": session["openingText"],
            "outcome": "continue", "turnCount": 0, "clearSteps": [], "state": session["state"],
        }))

    @transport.event_handler("on_participant_left")
    async def on_participant_left(_transport, _participant, _reason):
        await worker.queue_frame(EndFrame())

    @transport.event_handler("on_call_state_updated")
    async def on_call_state_updated(_transport, state):
        if state == "left":
            await worker.queue_frame(EndFrame())

    runner = WorkerRunner(handle_sigint=args.handle_sigint)
    await runner.run(worker)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()

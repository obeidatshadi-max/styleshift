"""Pipecat Cloud entry point. Audio goes through Daily and Gemini Live."""
import asyncio
import os
from contextlib import suppress

from dotenv import load_dotenv
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker, ProcessorUnusablePolicy
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.daily.transport import DailyParams
from pipecat.workers.runner import WorkerRunner

from scenario import build_prompt

load_dotenv(override=False)

async def bot(runner_args: RunnerArguments):
    prompt = build_prompt(getattr(runner_args, "body", None))
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("Set GOOGLE_API_KEY in the agent secret set")
    model = os.environ.get("GEMINI_LIVE_MODEL", "gemini-3.1-flash-live-preview")
    transport = await create_transport(runner_args, {
        "daily": lambda: DailyParams(audio_in_enabled=True, audio_out_enabled=True),
        "webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True),
    })
    llm = GeminiLiveLLMService(
        api_key=api_key,
        settings=GeminiLiveLLMService.Settings(
            model=model, voice=os.environ.get("GEMINI_VOICE", "Charon"),
            system_instruction=prompt,
        ),
    )
    context = LLMContext()
    user, assistant = LLMContextAggregatorPair(context)
    pipeline = Pipeline([transport.input(), user, llm, transport.output(), assistant])
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
        idle_timeout_secs=60,
        processor_unusable_policy=ProcessorUnusablePolicy.END,
    )
    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
    await runner.add_workers(worker)
    greeted = False

    @transport.event_handler("on_client_connected")
    async def connected(transport, client):
        nonlocal greeted
        if not greeted:
            greeted = True
            context.add_message({"role": "developer", "content":
                "Start the practice now with a brief in-character objection in the selected language."})
            await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def disconnected(transport, client):
        await runner.cancel()

    async def time_limit():
        await asyncio.sleep(600)
        await runner.cancel()

    deadline = asyncio.create_task(time_limit())
    try:
        await runner.run()
    finally:
        deadline.cancel()
        with suppress(asyncio.CancelledError):
            await deadline

if __name__ == "__main__":
    from pipecat.runner.run import main
    main()

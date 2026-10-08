"""Provider adapters for the shared StyleShift Pipecat pipeline."""
import os
from dataclasses import dataclass


def resolve_provider(body=None, env=None):
    env = os.environ if env is None else env
    if body is not None and not isinstance(body, dict):
        raise ValueError("Session body must be an object")
    provider = (body or {}).get("provider", env.get("LIVE_PROVIDER", "gemini"))
    if provider not in ("gemini", "openai"):
        raise ValueError("provider must be gemini or openai")
    return provider


@dataclass
class LiveProvider:
    service: object
    user_params: object


def create_live_provider(prompt, body=None, env=None):
    env = os.environ if env is None else env
    provider = resolve_provider(body, env)
    key_name = "GOOGLE_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
    api_key = env.get(key_name)
    if not api_key:
        raise RuntimeError(f"Set {key_name} in the agent secret set")
    from pipecat.processors.aggregators.llm_response_universal import LLMUserAggregatorParams

    if provider == "gemini":
        from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
        service = GeminiLiveLLMService(
            api_key=api_key,
            settings=GeminiLiveLLMService.Settings(
                model=env.get("GEMINI_LIVE_MODEL", "gemini-3.8-live"),
                voice=env.get("GEMINI_VOICE", "Charon"),
                system_instruction=prompt,
            ),
        )
        return LiveProvider(service, LLMUserAggregatorParams())

    from pipecat.services.openai.live.llm import OpenAILiveLLMService
    from pipecat.services.openai.responses.llm import OpenAIResponsesLLMService
    from pipecat.turns.user_turn_strategies import ExternalUserTurnStrategies
    delegation = None
    if env.get("OPENAI_LIVE_BACKEND_MODEL"):
        delegation = OpenAILiveLLMService.ResponsesDelegation(
            settings=OpenAIResponsesLLMService.Settings(
                model=env["OPENAI_LIVE_BACKEND_MODEL"], system_instruction=prompt,
            ),
        )
    service = OpenAILiveLLMService(
        api_key=api_key,
        settings=OpenAILiveLLMService.Settings(
            model=env.get("OPENAI_LIVE_MODEL", "gpt-live-1"),
            voice=env.get("OPENAI_LIVE_VOICE") or None,
            system_instruction=prompt,
        ),
        delegation=delegation,
    )
    return LiveProvider(service, LLMUserAggregatorParams(
        user_turn_strategies=ExternalUserTurnStrategies(enable_interruptions=False),
    ))

import sys
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from live_provider import create_live_provider, resolve_provider


class Service:
    Settings = SimpleNamespace
    ResponsesDelegation = SimpleNamespace

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class ProviderTests(unittest.TestCase):
    def test_selection_and_invalid_inputs(self):
        self.assertEqual(resolve_provider(None, {}), "gemini")
        self.assertEqual(resolve_provider({}, {"LIVE_PROVIDER": "openai"}), "openai")
        self.assertEqual(resolve_provider({"provider": "gemini"}, {"LIVE_PROVIDER": "openai"}), "gemini")
        for body in ([], "openai", {"provider": None}, {"provider": []}, {"provider": "other"}):
            with self.subTest(body=body), self.assertRaises(ValueError):
                resolve_provider(body, {})

    def test_only_selected_credentials_required(self):
        for provider, key in (("gemini", "GOOGLE_API_KEY"), ("openai", "OPENAI_API_KEY")):
            with self.assertRaisesRegex(RuntimeError, key):
                create_live_provider("prompt", {"provider": provider}, {})

    def test_service_configuration_and_turn_policy(self):
        # These fakes test our wiring, not provider network compatibility.
        definitions = {
            "pipecat.processors.aggregators.llm_response_universal": {"LLMUserAggregatorParams": SimpleNamespace},
            "pipecat.services.google.gemini_live.llm": {"GeminiLiveLLMService": Service},
            "pipecat.services.openai.live.llm": {"OpenAILiveLLMService": Service},
            "pipecat.services.openai.responses.llm": {"OpenAIResponsesLLMService": Service},
            "pipecat.turns.user_turn_strategies": {"ExternalUserTurnStrategies": SimpleNamespace},
        }
        modules = {}
        for name, exports in definitions.items():
            module = ModuleType(name)
            module.__dict__.update(exports)
            modules[name] = module
        with patch.dict(sys.modules, modules):
            gemini = create_live_provider("same prompt", {}, {"GOOGLE_API_KEY": "test"})
            self.assertEqual(gemini.service.settings.model, "gemini-3.8-live")
            self.assertFalse(hasattr(gemini.service.settings, "thinking_config"))
            openai = create_live_provider("same prompt", {"provider": "openai"}, {"OPENAI_API_KEY": "test"})
            self.assertEqual(openai.service.settings.model, "gpt-live-1")
            self.assertEqual(openai.service.settings.system_instruction, gemini.service.settings.system_instruction)
            self.assertFalse(openai.user_params.user_turn_strategies.enable_interruptions)
            self.assertIsNone(openai.service.delegation)
            configured = create_live_provider("scenario", {"provider": "openai"}, {
                "OPENAI_API_KEY": "test", "OPENAI_LIVE_BACKEND_MODEL": "backend",
                "OPENAI_LIVE_VOICE": "voice", "OPENAI_LIVE_MODEL": "override",
            })
            self.assertEqual(configured.service.settings.model, "override")
            self.assertEqual(configured.service.settings.voice, "voice")
            self.assertEqual(configured.service.delegation.settings.system_instruction, "scenario")
            self.assertEqual(configured.service.delegation.settings.model, "backend")

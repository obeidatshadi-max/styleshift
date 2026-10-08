import unittest
from scenario import build_prompt, normalize_session

class ScenarioTests(unittest.TestCase):
    def test_sandbox_defaults_to_iraqi(self):
        self.assertEqual(normalize_session(None)["lang"], "ar")
        self.assertIn("Start in Iraqi Arabic", build_prompt())

    def test_english_preserves_doctor(self):
        data = {"lang": "en", "doctor": {"name": "Dr. Sara", "style": "driver",
                "objections": ["limited time"]}}
        result = normalize_session(data)
        self.assertEqual(result["doctor"]["name"], "Dr. Sara")
        prompt = build_prompt(data)
        self.assertIn("Start in English", prompt)
        self.assertIn("decisive", prompt)

    def test_reject_invalid_session(self):
        for data in ([], {"lang": "fr"}, {"doctor": []},
                     {"doctor": {"style": "unknown"}},
                     {"doctor": {"objections": "string"}},
                     {"difficulty": "invalid"}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                normalize_session(data)

    def test_bound_profile_and_drop_unrelated_fields(self):
        result = normalize_session({"doctor": {"name": "x" * 2000,
            "rep_id": "private", "objections": ["x"] * 20}})
        self.assertEqual(len(result["doctor"]["name"]), 1500)
        self.assertEqual(len(result["doctor"]["objections"]), 8)
        self.assertNotIn("rep_id", result["doctor"])

if __name__ == "__main__":
    unittest.main()

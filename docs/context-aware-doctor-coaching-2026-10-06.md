# Context-aware doctor coaching

New conversation reports can show one **Understand this moment** card: the doctor's actual words, up to two tentative explanations, missing context, a respectful clarifying question, and the next recorded doctor response when one exists after a rep turn. The response is historical evidence, never a prediction about the suggested question.

The card is optional. Older saved reports remain readable, and reports without a useful supported moment omit it. The existing JSON report storage needs no migration. New report generation uses the revised prompts; existing reports are not rewritten.

Shared report, analyst, coach and post-visit debrief instructions distinguish observed behavior from interpretation. They prohibit diagnosing emotion from speech speed or inferring motives from nationality, profession or ambiguous support requests. These are model instructions, not a guarantee of semantic accuracy; human review of real outputs remains necessary.

The text-simulation doctor no longer receives an automatic trust bonus for feeling labels or an automatic penalty for prescribing questions. Its reply considers the actual conversation. Other existing deterministic simulation heuristics remain in place.

Under a saved doctor's Practice section, **Practice an Iraqi visit situation** opens six fictional text-practice scenarios in Arabic or English: limited time, product similarity, professional respect, an indirect objection, missed follow-up and an ambiguous support request. They use the existing practice-focus handoff and do not update the doctor's saved traits.

Review examples with a field trainer: verify that the card offers plausible alternatives, uses a natural clarifying question, avoids invented motives, and accurately distinguishes recorded responses from suggestions. Confirm Arabic phrasing with Iraqi reps. Acoustic measurement and real-world inference validation are outside this change.

# Usual pattern / This conversation / Helpful adjustment

Extends the existing "Communication style" section of the conversation report. It helps a rep tell a doctor's recorded usual tendency apart from what the doctor actually said today. A rushed conversation is not read as a changed personality.

## What the rep sees

1. **Usual pattern.** The rep's own saved profile, labelled as such, or "No usual pattern recorded." In a simulation it says "Practice setting" and "not a trait of a real doctor".
2. **This conversation.** Up to two things the doctor said, each with the exact quote.
3. **What remains uncertain.** Only when there is something to say: the model's alternative explanation, a note that the profile and the conversation differ, a short-conversation note, or "the reason for the short replies is not clear".
4. **Helpful adjustment.** One adjustment and one short phrase the rep could say.

The report shows this view instead of the older customer read and coaching card, so the same advice does not appear twice.

## Where each part comes from

| Part | Source |
|---|---|
| Usual pattern | App context only (`ReportContext`). Never model text. |
| Observations | Counterpart lines the transcript confirms, whose category the deterministic extractor also found in that same line. The model picks among detected signals; it cannot add one. A separate "short replies" observation is counted from reply length. |
| Differs from usual | The final grounded style reading, so a claim that kept no evidence cannot raise it. Never shown for a simulation. |
| Uncertainty, adjustment, phrase | Model prose from the existing coaching card, kept only when at least one confirmed observation backs it and it names no feeling or motive. |

Code: `src/lib/report/usualVsToday.ts` (builder), `groundReport.ts` (wiring), `socialSignals.ts` (extraction), `SocialStyleCard.tsx` (display), schema field `socialStyle.usualVsToday` (optional).

## What changed in existing behaviour

- A style read about the customer now needs a counterpart line as evidence, and one about the rep a rep line. A line from the other speaker is dropped.
- The profile-difference flag is computed from the final reading, not the raw model claim.
- The difference wording is neutral ("This conversation differs from your saved profile"), also for older reports.
- Signal extraction keeps every distinct category in a line, once per line. New category `time_limit` ("one minute", "عندي دقيقة", and similar).

## Older reports

The new field is optional. Reports saved before it existed render as before and show no usual-pattern section. Nothing regenerates them. No database change.

## Limits

- **Saved doctor profile reaches reports only from colleague role-plays** (`partner_style`). Real customer visits, AI-doctor voice and AI-doctor text pass no saved style: `customer_visits` has no doctor link. Those reports show "No usual pattern recorded" or the practice setting. Linking a visit to a doctor needs a column and a picker in the recording flow.
- The saved style is a rep-chosen label, not a measurement or a verified trait.
- Matching is deliberately literal. It misses many phrasings, and "two minutes" or "data" can occasionally appear in an unrelated sense. Signal counts are not personality probabilities.
- The feeling-and-motive filter is a short word list behind the prompt rules. It will miss phrasings it does not list.
- Arabic wording is unreviewed. **Needs review by an Iraqi trainer:** every `report.usual.*` string, the time-limit and detail patterns in `socialSignals.ts`, and the Arabic emotion words in `usualVsToday.ts`.
- Nothing here writes to a doctor profile. Simulation results never update a real doctor.

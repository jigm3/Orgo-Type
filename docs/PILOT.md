# Pilot: two weeks with one student

Goal: find out which patterns improve and which cards confuse people, before opening Orgo Type to the club.

## Before the pilot (for whoever runs it)

1. **Verify the content the pilot will use.** Open `/review.html` on the live site. For every card that's right,
   set `"verified": true, "verifiedBy": "<name>"` in its JSON file (fix or delete the rest). At minimum: the Unit 0–2
   lessons and reactions, the side deck, and both quiz forms (`content/diagnostic/quiz.json`). Push; the real app
   (not `/dev/`) shows only verified material.
2. **Optional: turn on sync** (see README → Sync) so the student's phone and laptop share progress and problem reports
   reach the Firebase console.

## For the student

1. Open the site on your phone and add it to your home screen (Safari: Share → Add to Home Screen;
   Chrome: ⋮ → Add to Home screen). Open it from there from now on.
2. **Day 1:** Settings is the ⚙︎. Put your name in, then go Home → footer → **Check-up quiz → Form A**
   (10–15 min, no notes). Then do the Unit 0 lesson.
3. **Every day for two weeks:** open the app and press **Start** (about 15–20 minutes). Do the lesson when a new
   unit opens. If a card looks wrong or confusing, tap **Report a problem with this card**.
4. **Day 15:** Check-up quiz → **Form B**. Then Settings → **Export progress** and send the file.

## After the pilot

```bash
python3 tools/pilot_report.py orgo-type-<name>-<date>.json
```

prints: days active and minutes per day; first-try accuracy per pattern in week 1 vs week 2; accuracy by card type;
the most-missed cards (look at their wording and chemistry first); form A vs form B by pattern; and every problem report.

Done when we know which patterns improved and which cards confuse people.

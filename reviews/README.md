# Content reviews

Each JSON file here is the report of an **independent AI review pass**: a reviewer agent that did not write the
content checked every item in one content file against standard textbook chemistry, fixed clear errors directly,
and gave each item a verdict:

- `pass`: correct as written
- `fixed`: the reviewer corrected it
- `doubt`: real uncertainty; kept out of the main app (it stays in the `/dev/` preview)

`python3 tools/apply_ai_review.py reviews/*.json` turns `pass`/`fixed` into `"verified": true` with
`"verifiedBy": "AI review (date)"`. The app tells students the content was AI-reviewed, not instructor-reviewed.
A human review through the review sheet (`tools/apply_review.py`) always takes precedence and is never overwritten.

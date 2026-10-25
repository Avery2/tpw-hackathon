# TPW skills for ChatGPT

Five ChatGPT skills for TPW staff. A skill is a saved set of instructions, with any files it needs, that ChatGPT uses on its own when a request matches. These five read TPW's submissions Google Sheet and never change it.

| Skill | Ask ChatGPT something like |
| --- | --- |
| `tpw-missing-submissions` | "Which members haven't submitted this quarter or last quarter?" |
| `tpw-quarter-numbers` | "What are this quarter's numbers?" or "Give me 2026's totals." |
| `tpw-check-submissions` | "Check this week's submissions." |
| `tpw-member-summary` | "Make Riverbend a summary of what they reported this year." |
| `tpw-tool-help` | "A member says the form told them the sheet is busy. What do I tell them?" |

Status on 25 October 2026: built and tested against the website's own code and a copy of the real Sheet, but not yet tried inside a real ChatGPT account. Every row in the Sheet is still test data, so the numbers skills will say there is nothing real to count until members submit.

## Installing them

Whoever installs them first connects Google Drive in ChatGPT (Settings, then Plugins, then Google Drive), signed in with a TPW Google account that can open the Sheet "TPW guided form submissions (App Script)". In ChatGPT's settings for Google Drive, set it to ask before making any change.

**On ChatGPT Business or Enterprise (recommended):** a workspace admin imports this folder from GitHub once. In the Admin console, open Plugins, choose Add, then Import marketplace. Enter the repository's address (https://github.com/Avery2/tpw-hackathon, or wherever TPW moves it) and `chatgpt-plugin` as the Path. ChatGPT then checks GitHub every day, so changes to the code reach the skills on their own. If an update is broken, ChatGPT keeps the last version that worked. The sync uses the admin's GitHub sign-in: if that lapses, the skills keep working but stop updating. ([OpenAI's instructions](https://help.openai.com/en/articles/20001504-importing-and-syncing-plugin-marketplaces-from-github))

**On a personal plan:** download each file in `uploads/` from GitHub. In ChatGPT, open Plugins, then the Skills tab, choose Create, then Upload from your computer, and upload them one at a time. Skills added in the desktop app and on the web or phone don't sync, so do it in each app you use. After a change to the code, upload them again. ([OpenAI's instructions](https://help.openai.com/en/articles/20001066-skills-in-chatgpt))

## How it fits together

```
chatgpt-plugin/
  .claude-plugin/marketplace.json   the list ChatGPT imports (Claude's format, which ChatGPT accepts)
  tpw/                              the plugin
    .claude-plugin/plugin.json
    skills/<skill>/SKILL.md         each skill's instructions: edit these
    skills/<skill>/scripts/         built: the counting script
    skills/<skill>/reference/       built: rules, member and facility lists, the guide
  source/                           the one copy of everything shared: edit these
    tpw_data.py                     reads the Sheet and counts it the website's way
    rules.md                        how every skill answers, TPW's words, safety, getting the Sheet
    tool-guide.md                   the plain-words guide to the tool, for tpw-tool-help
  uploads/<skill>.zip               built: one file per skill, for uploading by hand
  tests/                            made-up rows and the check against the website's code
```

ChatGPT can only see the files inside a skill's own folder, so `scripts/build_chatgpt_skills.py` copies in what each skill needs: `source/`, the member list (`data/public/tpw-members.csv`, the same list the form suggests), the facility list from `team-form/receiver/Rows.gs`, TPW's Data Glossary, `docs/faq.md` and `docs/after-the-demo.md`. After changing any of those, run:

```bash
python3 scripts/build_chatgpt_skills.py
```

and commit what it changes. GitHub's test run fails if you forget.

## Keeping the numbers the same as the website's

`source/tpw_data.py` counts the Sheet with Python copies of the website's rules: `team-form/receiver/Dashboard.gs` (rows into submissions), `team-dashboard/js/data.js` (the latest submission for each program wins), `team-dashboard/js/rac.js` (credit days and facility costs) and `team-dashboard/js/submission-tracker.js` (which quarter a submission is in). If you change one of those, change `tpw_data.py` to match. `tests/parity.mjs` runs the same made-up rows through both and fails if any submission, program or estimate differs.

To compare with the real Sheet, download it as an Excel file and run `node chatgpt-plugin/tests/parity.mjs --live <file>.xlsx`. That reads what the live receiver sends the website (it never submits anything) and compares.

## Tests

```bash
python3 scripts/test_chatgpt_skills.py        # each command's answers, Excel and CSV downloads
python3 scripts/build_chatgpt_skills.py --check
node chatgpt-plugin/tests/parity.mjs           # same counts as the website's own code
```

All three run on every push (`.github/workflows/tests.yml`).

# Spreadsheet access that survives a pro-bono handover

**Recommendation:** Preserve staff’s spreadsheet working practices, but choose the smallest supportable connection. The technical brief’s export-first proposal is sensible, not yet validated with TPW. Manual exports can shift work onto staff; a generated Sheet can remove their ability to correct records. Test both consequences before committing.

This is research, not implementation. **Source statements** below were checked in original practitioner publications; **TPW inferences** are recommendations, not demonstrated outcomes. No practitioners were interviewed. Government examples are transferable experience, not evidence of TPW’s needs or eligibility for assistance.

## 1. Spreadsheets can be a legitimate working interface

**Source statements:** TechSoup’s *Data Handling and Digital Readiness* report summarizes a 2020 survey of 11,758 civil-society respondents across 135 countries. Its takeaways say: “Spreadsheets are heavily relied upon for data use and sharing within and between organizations.” Training, funding and adoption capacity are barriers. This was an open-link digital survey, not a representative census; the report warns that digitally connected organizations may be overrepresented [1, PDF pp. 6–8, 23, 28].

TechSoup’s practitioner article on beneficiary communications explicitly allows smaller nonprofits to use shared spreadsheets with regular team check-ins instead of a CRM [2]. It also warns about scattered spreadsheets and tools without accompanying training/processes. This is consultancy-oriented guidance, not a controlled comparison. Its person-level examples do **not** justify collecting participant identifiers at TPW.

**TPW inference:** Ask what staff actually do in Sheets: reconcile totals, prepare reports, flag missing submissions, annotate exceptions, or correct accepted numbers. A read-only dashboard is not necessarily a substitute. Keep analysis and annotations possible without making every spreadsheet edit authoritative.

## 2. Discover the workflow together, not just the connector

**Source statements:** DataKind’s discovery question bank asks about a staff member’s “day in the life,” existing data access, affordability, users’ comfort with data, maintenance skills and adoption support [3]. Its execution guidance says “we design with, not for,” while cautioning against overburdening partner staff [4]. Code for America describes interviews, observation, journey mapping and usability testing as ways to build the right thing at the right time [5]. These are organizations’ own practice guides.

**TPW inference:** Run a short session using synthetic submissions and an actual reporting task. Have staff import an export, find a questionable count, request a correction and produce a report. Include member organizations with different reporting capacity. Decide acceptable staleness and refresh frequency from that task—not from what a connector can advertise. Do not turn discovery into unpaid specification-writing for already-busy staff.

## 3. Limit infrastructure, but do not romanticize spreadsheets

**Source statements:** US Digital Response’s St. Louis case study describes learning the existing spreadsheet workflow, cleaning and migrating data into Airtable, adding forms/automations/reporting, and coaching staff throughout. The team reports weekly demonstrations and feedback [6]. This shows a spreadsheet can become a bottleneck; it does not establish that TPW needs Airtable. Reported improvements are the delivery organization’s case-study claims, not an independent impact evaluation.

USDR says it favors inexpensive low/no-code tools where appropriate, discusses ongoing maintenance costs before recommendations, and documents processes/transfers knowledge. It currently works exclusively with state, local and tribal governments [7]; this is delivery guidance, not a promise of nonprofit support.

**TPW inference:** Minimize the total operating burden, not just custom code. A connector subscription can be preferable to an unsupported worker, but adds vendor/access dependencies. A manual download can be preferable to either, unless repeated importing and reconciliation consume more staff time. None requires a frontend or product-platform rewrite.

## 4. Volunteer departure is a design requirement

**Source statements:** DataKind’s technical handoff guidance requires usable documentation, a fresh installation, target-environment testing and a partner test-run. It says: “You shouldn’t be teaching someone python or to use AWS at this stage.” Substantial inability to sustain the deliverable is a scoping mismatch, not simply a training problem [8]. Its instructional guidance recommends testing with someone unfamiliar with the project specifically because turnover happens, and budgeting documentation even at the expense of features [9].

DemocracyLab’s original FareStart community case report describes a bounded 90-day volunteer project, a named staff counterpart, advance scoping and post-hackathon completion work. Its weekly-report automation is evidence of a specific nonprofit delivery experience, not proof of indefinite volunteer maintenance [10].

**TPW inference:** Before handover, name a staff data steward, backup administrator and technical support contact. TPW must control accounts, billing, repository, exports and recovery instructions—not depend on a departing volunteer’s login. Staff should demonstrate routine use; a successor maintainer should demonstrate rebuilding a snapshot. Agree a support end date and fallback to downloads.

## 5. Costs and corrections need explicit owners

**Source statements:** TechSoup’s software-spend guidance recommends tracking each subscription’s owner, cost and billing timeline, and transferring or canceling subscriptions during offboarding [11]. It promotes a vendor product; the operational advice is not independent evidence of that product’s value. DataKind asks about known data gaps [3]; St. Louis’s implementation included cleanup before migration [6]. Neither establishes TPW’s correction policy.

**TPW inference:** Budget staff training, cleanup, renewals and incident response alongside hosting/licenses. Give staff an accessible correction route before removing authoritative Sheet editing: reference, changed counts, reason, receipt and accountable reviewer. Preserve originals and apply the accepted revision consistently to dashboards and regenerated exports. Never silently treat missing counts as zero or overwrite staff annotations during refresh.

**Unresolved:** TPW’s actual spreadsheet tasks, correction volume, budget, Workspace arrangements and long-term support capacity were not determined. These sources support participatory discovery and sustainable handover; they do not prove Neon plus Sheets is the right operational arrangement.

## Primary sources

1. [TechSoup’s own survey report](https://blog.techsoup.org/hubfs/Downloads/data-handling-survey-2021.pdf).
2. [TechSoup practitioner guidance](https://blog.techsoup.org/en-us/posts/using-technology-to-communicate-with-your-nonprofits-beneficiaries).
3. [DataKind discovery questions](https://datakind.github.io/project-stages/discovery/discovery_stage_question_bank.html).
4. [DataKind execution guidance](https://datakind.github.io/project-stages/execute/).
5. [Code for America research practice](https://info.codeforamerica.org/qualitative-research).
6. [USDR’s St. Louis delivery case study](https://www.usdigitalresponse.org/resources/how-relieving-administrative-burden-for-one-city-helped-house-more-people-facing-homelessness).
7. [USDR’s operating approach](https://www.usdigitalresponse.org/how-we-work).
8. [DataKind technical handoff](https://datakind.github.io/project-stages/share/technical_project_hand-off.html).
9. [DataKind documentation and sustainability guidance](https://datakind.github.io/project-stages/execute/documentation_and_instructional_materials.html).
10. [DemocracyLab’s FareStart community case report](https://blog.democracylab.org/farestart-pilots-new-approach-to-engage-tech-volunteers/amp/).
11. [TechSoup software-spend guidance](https://blog.techsoup.org/en-us/posts/5-tips-for-nonprofits-to-spend-less-on-software).

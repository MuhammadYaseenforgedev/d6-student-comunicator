# Chatbot Phase 1-2 Smoke Test Matrix

Use this matrix to manually verify the live-intent chatbot and the Phase 2 intent-routing refinements.

## Student
- Supported query: `Show my announcements`
- Expected: `Summary:` line with active announcement count, then up to 3 announcement details
- Unsupported query: `Show admin finance accounts`
- Expected: fallback guidance listing supported topics, not admin data
- Empty-state expectation: `Summary: You have no active announcements right now.` or `Summary: No results are available yet.`
- Failure-state expectation: `Summary: I couldn't load your results right now.` and `Note: Please try again shortly.`

## Parent
- Supported query: `What upcoming events do I have?`
- Expected: `Summary:` line with upcoming event count for linked children, then up to 3 child-labelled event details
- Unsupported query: `Show academic staff results management`
- Expected: fallback guidance listing supported topics, not staff-only data
- Empty-state expectation: `Summary: No linked children were found for calendar yet.` or `Summary: No finance items were found for your linked children.`
- Failure-state expectation: `Summary: I couldn't reach the finance service at the moment.` and `Note: Please try again shortly.`

## Academic Staff
- Supported query: `What is my attendance?`
- Expected: `Summary:` line with module coverage count, then up to 3 accessible attendance modules
- Unsupported query: `Show my results`
- Expected: `Summary: Live results are currently available through the chatbot for students and parents only.` plus a note pointing to `Manage Results`
- Empty-state expectation: `Summary: No attendance modules are available right now.`
- Failure-state expectation: `Summary: I couldn't load attendance right now.` and `Note: Please try again shortly.`

## Academic Admin
- Supported query: `Show my calendar`
- Expected: `Summary:` line with upcoming event count, then up to 3 upcoming event details
- Unsupported query: `Show finance`
- Expected: `Summary: Finance summaries are not currently available through the chatbot for this admin role.` plus supported-role note
- Empty-state expectation: `Summary: No upcoming calendar events were found.`
- Failure-state expectation: `Summary: I couldn't load calendar events right now.` and `Note: Please try again shortly.`

## Finance Admin
- Supported query: `Do I have unpaid fees?`
- Expected: `Summary:` line with flagged finance account count, then up to 3 finance account details
- Unsupported query: `Show attendance`
- Expected: `Summary: Attendance is not currently available through the chatbot for finance admin accounts.`
- Empty-state expectation: `Summary: No outstanding finance items were found.`
- Failure-state expectation: `Summary: I couldn't reach the finance service at the moment.` and `Note: Please try again shortly.`

## Super Admin
- Supported query: `Show announcements`
- Expected: `Summary:` line with active announcement count, then up to 3 announcement details
- Unsupported query: `Show results`
- Expected: `Summary: Live results are currently available through the chatbot for students and parents only.` plus `Manage Results` note
- Empty-state expectation: `Summary: You have no active announcements right now.` or `Summary: No upcoming calendar events were found.`
- Failure-state expectation: `Summary: I couldn't load announcements right now.` and `Note: Please try again shortly.`

## General Checks
- Supported live-intent replies should always use `Summary:` first, optional `Details:` next, and `Note:` only when needed.
- Empty states should stay clean and role-safe, without raw API payloads or technical text.
- Service failures should never expose backend error strings in chat.
- Unsupported role/capability combinations should explain the limitation honestly instead of guessing.

## Phase 2 Refinement Checks
### Student
- Ambiguous query: `show updates and attendance`
- Expected: clarification response such as `Summary: I can help with one topic at a time. Do you want announcements or attendance?`
- Navigation query: `open results page`
- Expected: navigation-first reply with a `Results` action button, not a descriptive topic explanation

### Parent
- Ambiguous query: `results and fees`
- Expected: clarification response such as `Summary: I can help with one topic at a time. Do you want results or finance?`
- Navigation query: `open calendar page`
- Expected: navigation-first reply with a `Calendar` action button for the parent portal
- Unsupported action query: `can you link children`
- Expected: honest limitation response plus a `Children` action button

### Academic Staff
- Unsupported action query: `can you publish results`
- Expected: honest limitation response plus a `Manage Results` action button
- Expected follow-up: the chatbot should not pretend to publish results directly inside chat

### Academic Admin / Super Admin
- Unsupported action query: `can you manage users`
- Expected: `I can help open the Accounts page, but I can't directly manage users inside the chatbot yet.` plus an `Accounts` action button
- Navigation query: `open accounts page`
- Expected: navigation-first reply with an `Accounts` action button

### Finance Admin
- Ambiguous query: `results and fees`
- Expected: clarification response instead of silently choosing finance or results
- Unsupported action query: `can you process fees`
- Expected: honest limitation response plus a `Finance` action button

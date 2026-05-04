# Sparky Demo Checklist

Use this checklist for final chatbot demos and smoke tests.

## Best Demo Prompts

- `What should I check today?`
- `How do I check results?`
- `Open results page`
- `Any announcements?`
- `I want to upload an assessment`
- `Can you manage users?`
- `Open it`
- `And then?`

## Student

- Overview: `What should I check today?`
- Live data: `Show my results`
- Workflow: `I want to upload an assessment`
- Fallback check: `Hi`
- Follow-up check: `Open it`

## Parent

- Overview: `Anything important?`
- Live data: `Show my child's results`
- Workflow: `How do I check my child's attendance?`
- Empty-state check: parent with no linked child should be sent to `Children`
- Follow-up check: `And then?`

## Lecturer

- Overview: `What do I need to look at?`
- Live data: `Any attendance?`
- Workflow: `How do I mark attendance?`
- Workflow variant: `How do I check results?`
- Follow-up check: `Show me the page`

## Academic Admin

- Overview: `What should I open next?`
- Workflow: `How do I approve a parent link?`
- Workflow: `How do I manage accounts?`
- Unsupported-action check: `Can you approve a parent link?`
- Domain routing check: `Any approvals?`

## Super Admin

- Overview: `What's going on?`
- Workflow: `How do I view tickets?`
- Domain routing check: `Is there any tickets for me?`
- Unsupported-action check: `Can you work tickets?`
- Follow-up check: `Open it`

## Finance Admin

- Overview: `What should I open?`
- Live data: `Any finance updates?`
- Workflow: `Where do I go to see finance?`
- Unsupported-capability check: `How do I check attendance?`
- Fallback check: `Hello`

## Reliability Checks

- Broad-question check: `Anything new for me?`
- Ambiguity check: `results and fees`
- Unsupported-action check: `Can you manage users?`
- Partial-understanding check: `Have any parents tried to link today?`
- No-data check: verify the reply stays clear and does not imply missing data exists
- Rapid follow-up check: `Open it` after a workflow reply, then `And then?`

## Demo Ready

- First greeting feels concise and role-appropriate
- Quick actions match the role
- Workflow replies stay honest about what chat cannot do directly
- Fallback replies stay short and point to relevant actions
- No raw errors or confusing wording appear in the chat

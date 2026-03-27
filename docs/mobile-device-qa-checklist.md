# VaultedShield Mobile Device QA Checklist

Use this checklist on a real iPhone in Safari. Focus on trust breakers, first-time creation flows, and shell behavior.

## Setup

- Use an iPhone-width viewport or a real iPhone if available.
- Open Safari remote inspector if you want to watch dev-only creation traces.
- Test both:
  - a fresh logged-in user with no household, no property, and no mortgage
  - an existing logged-in user with an owned household
  - a logged-out session

## Mobile Shell

- Open the drawer from the main navigation toggle.
- Confirm the drawer slides in cleanly and does not flicker.
- Tap the backdrop and confirm the drawer closes.
- Press `Esc` on a connected keyboard and confirm the drawer closes.
- Try to scroll the page while the drawer is open.
- Confirm the background does not scroll.
- Scroll a long drawer menu and confirm the drawer itself scrolls.
- Confirm top and bottom spacing respect the notch and home indicator.
- Confirm there is no horizontal overflow anywhere on the shell.

## Forms

- Open the property create form.
- Tap into each input and confirm the keyboard does not cover the active field.
- Confirm the primary submit button remains reachable.
- Submit once and confirm the button does not permit duplicate rapid submits.
- Trigger a friendly error state and confirm:
  - no raw database text appears
  - the layout stays stable
  - the error remains readable
- Repeat the same checks for the mortgage create form.

## First-Time Creation Flows

### First Mortgage Creation, No Prior Household

- Sign in with a user that has no existing household.
- Open Mortgage Hub.
- Create the first mortgage loan.
- Confirm the flow succeeds without requiring preloaded household state.
- Confirm the new mortgage appears after creation.
- In dev tools, confirm the trace sequence shows:
  - `resolved_dependencies`
  - `created_asset`
  - `created_module_record`

### First Property Creation, No Prior Household

- Sign in with a user that has no existing household.
- Open Property Hub.
- Create the first property record.
- Confirm the flow succeeds without requiring preloaded household state.
- Confirm the new property appears after creation.
- In dev tools, confirm the trace sequence shows:
  - `resolved_dependencies`
  - `created_asset`
  - `created_module_record`

### Existing Household Paths

- Sign in with a user that already owns a household.
- Create one additional mortgage.
- Create one additional property.
- Confirm both use the existing household and do not create duplicate shell state.

### Logged-Out Blocking

- Sign out.
- Open the property and mortgage create flows.
- Confirm submit is blocked cleanly.
- Confirm the user sees auth-required guidance, not a system error.

## Visual Trust

- Confirm buttons are easy to tap with one hand.
- Confirm long addresses and labels wrap instead of overflowing.
- Confirm cards do not jump or resize awkwardly when data or errors appear.
- Confirm spacing feels consistent between sections, inputs, and buttons.

## Dev Trace Events

In development, watch the browser console for grouped events:

- `resolved_dependencies`
- `created_asset`
- `created_module_record`
- `rolled_back_asset`
- `module_record_creation_failed`

These are expected to help validate:

- current user id
- resolved household id
- created asset id
- created mortgage or property id
- rollback events after module-row failure

## Known Risks To Watch

- iOS keyboard overlap on long forms
- stale page state after first-time household creation
- duplicate submit during poor network conditions
- drawer scroll bleed if Safari restores body scrolling unexpectedly
- long address text causing wrapping pressure in cards

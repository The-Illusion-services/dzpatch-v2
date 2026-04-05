# DZpatch V2 - Codebase Audit Findings (Part 2)

This document contains the latest findings from the static code analysis and functionality audit, complementing the original `fixes.md`. Overlapping issues already covered in `fixes.md` are cross-referenced here instead of being duplicated.

## Master Index

### Code Quality & TypeScript
- `16.1` [CROSS-REFERENCE] TypeScript Type Definitions Are Already Covered in `fixes.md`
- `16.2` [MEDIUM] React Hook Dependency Array Violations
- `16.3` [LOW] Unused Variables and Unicode BOM Issues

---

## Sections by Theme

### Code Quality, Typing, and Test Reliability

#### 16.1 CROSS-REFERENCE: TypeScript Type Definitions Are Already Covered in `fixes.md`
**Status:** Not added as a new issue because this overlap is already documented.
**Covered In:**
- `fixes.md` `3.1` for the project-wide TypeScript compilation failure and test-mock drift.
- `fixes.md` `9.28` for stale Supabase schema types versus the live database contract.
- `fixes.md` `10.1` for the resulting spread of `as any` workarounds.
**Why It Was Not Re-added:** 
Gemini's type-drift concern is valid, but it is already captured in the primary audit with broader scope and more specific schema examples, including `disputes`, `pricing_rules`, `rider_locations`, `payment_method`, and `negotiation_round`.

#### 16.2 MEDIUM: React Hook Dependency Array Violations
**Description:** 
Verified with `npx eslint "app/**/*.{ts,tsx}"`. ESLint flagged missing dependencies within `useEffect` and `useCallback` hooks across core flows.
**Affected Files:**
- `app/(customer)/active-order-tracking.tsx:172-184` (`riderProfile?.full_name` is read when redirecting to delivery success, but the enclosing `useEffect` depends only on `orderId` and `fetchOrder`)
- `app/(customer)/create-order.tsx:256-290` (`deliveryFee` is sent to `create_order`, but the enclosing `useCallback` dependency list omits it)
**Impact:** 
Missing hook dependencies can result in "stale closures", where the hook executes using outdated state or props. This can cause subtle, hard-to-reproduce bugs like the UI not updating when the rider's profile loads, or incorrect delivery fees being passed to submission functions.
**Recommendation:** 
Run `npx eslint --fix "app/**/*.{ts,tsx}"` and manually review/fix remaining dependency array warnings by safely including the missing variables or refactoring the logic outside the hook.

#### 16.3 LOW: Unused Variables and Unicode BOM Issues
**Description:** 
Verified with `npx eslint "app/**/*.{ts,tsx}"`. Static analysis identified unused variables and files saved with a Byte Order Mark (BOM).
**Affected Files:**
- `app/(customer)/finding-rider.tsx:48` (unused variables: `paramPickup`, `paramDropoff`, `paramFinalPrice`)
- `app/(customer)/withdraw.tsx:1` (Unexpected Unicode BOM)
- `app/(rider)/rider-withdraw.tsx:1` (Unexpected Unicode BOM)
- `app/(rider)/navigate-to-pickup.tsx:64` (unused `eslint-disable` directive)
- `app/(rider)/navigate-to-dropoff.tsx:68` (unused `eslint-disable` directive)
**Impact:** 
Unused variables clutter the codebase and can cause confusion. Unicode BOMs can occasionally cause parsing errors in certain build tools or cross-platform environments.
**Recommendation:** 
1. Remove the unused variables in `finding-rider.tsx`.
2. Resave `withdraw.tsx` and `rider-withdraw.tsx` using standard `UTF-8` encoding (without BOM) in your code editor.
3. Remove the stale `eslint-disable` directives from the rider navigation screens.

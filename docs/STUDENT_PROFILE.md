# Student Profile Design

## Principle

The product-facing identity is the Fox nickname, but storage should use a stable `studentId`.

## SGF flow

SGF does not always include a Fox nickname. After SGF import, ask the user who the student is:

- Black
- White
- Existing student
- New student
- Skip binding

If the SGF player name matches an existing alias, suggest that student.

## Fox flow

Fox nickname sync should automatically create or reuse the matching student profile. All imported games from that sync should bind to the student.

## Profile updates

Teacher runtime should write back:

- error types
- recurring patterns
- training focus
- recent analyzed game ids

## Avoid

- Do not create duplicate students for the same Fox nickname.
- Do not silently merge fuzzy matches without user confirmation.
- Do not prevent analysis if no student is bound; just skip profile writeback.

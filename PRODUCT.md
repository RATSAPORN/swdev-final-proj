# Massage Reservation
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Registered users reserve massages; administrators manage all reservations.

## Product Purpose
Implement the nine assignment requirements using the existing Express/Mongoose code, with an API and browser interface (confirmed by the user). Document original versus improved code for submission.

## Capabilities and Constraints
Register with name, telephone, email, password. Log in and out. Browse shops with address, telephone and opening/closing times. Create up to three reservations. View, edit and delete own reservations. Admins view, edit and delete any reservation. Adapt the original appointment code into reservations, as explicitly requested.

## Implementation decisions
Keep Express, MongoDB, bcrypt and JWT. Add a same-origin vanilla browser client without a separate frontend build. Three saved reservations per user; deleting one frees a slot. Date-only reservations use Thailand calendar days. This is a date-based queue, with no invented therapist availability or appointment-duration rules.

## Evidence on Hand
Original backend snapshot in docs/original. No existing visual assets or frontend.

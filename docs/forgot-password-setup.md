# Forgot password: what the app does and the two settings it needs

**In the app:** "Forgot password?" appears under the password box on the Manager tab and the rep "Individual" (email) tab. It asks for the email and always answers "If an account exists…", so it cannot be used to find out which emails have accounts. The emailed link signs the person in through `/auth/confirm`, then opens `/reset-password`, where they type the new password twice.

Reps who sign in with **mobile number + PIN** have no email, so there is nothing to send. A manager-side PIN reset does not exist yet.

## It will not send anything until you do these two things in Supabase

Project `cnlloaihrrmattuidpeh`, Authentication section.

1. **Custom SMTP.** The built-in email sender is limited to 2 emails an hour for the whole project and only delivers to your own team's addresses, so reset emails would not reach real users. Use the same Brevo account as Dawwar:
   - Host `smtp-relay.brevo.com`, port `587`
   - Username: your Brevo SMTP login. Password: a Brevo SMTP key (not your Brevo account password).
   - Sender email: an address you have verified as a sender in Brevo.
2. **Reset Password email template** (Emails, then Templates, then "Reset Password"). Replace the body with:

```html
<h2>Reset your password</h2>
<p>Open this link to choose a new password:</p>
<p><a href="{{ .SiteURL }}/reset-link?token_hash={{ .TokenHash }}">Choose a new password</a></p>
<p>If you did not ask for this, ignore this email.</p>
```

The link uses a token in the URL instead of the default code, so it works even when the email is opened in a different browser from the one that asked for it. It points at `/reset-link`, a page with a Continue button: the single-use token is only spent when the person presses it. Linking straight to `/auth/confirm` let mail systems that open links to scan them (common on company mail) use the token up first, so people arrived at "expired". Old emails that still point at `/auth/confirm` keep working. Site URL must be `https://style-shift.netlify.app` (it already is).

## Check it

1. Open the sign-in page, Manager tab, click "Forgot password?", enter a manager email, click Send.
2. The email should arrive within a minute. Click the link: you should land on "Choose a new password".
3. Save a new password: you see "Password updated" with two buttons. "Continue to the app" keeps you signed in. "Sign in again with the new password" signs you out and opens the sign-in page, so you can confirm the new password works. The page also has "Back to sign in" before you save.

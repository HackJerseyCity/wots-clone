import Header from '../components/Header';
import { usePageTitle } from '../hooks/usePageTitle';

export default function AboutPage() {
  usePageTitle('WOTS++ · About');
  return (
    <>
      <Header hide="about" />
      <main className="max-w-[720px] mx-auto px-6 py-[clamp(28px,5vw,56px)] leading-[1.6]">
        <h1 className="text-[clamp(26px,5vw,32px)] font-semibold tracking-tight mb-2">
          About WOTS++
        </h1>
        <p className="text-muted text-[17px] mb-10">
          A friendlier way to browse your WOTS reports — and a straightforward account of what
          happens to your data along the way.
        </p>

        <Section title="What this is">
          <p className="mb-3.5">
            WOTS++ is an independent web app that talks to <b>WOTS</b> — Jersey City's reporting
            app for parking, quality-of-life, and neighborhood-safety issues — using the same
            public interface the official app uses. Signing in here signs you in to your existing
            WOTS account; there is no separate account to create.
          </p>
          <p className="mb-3.5">
            It exists because the official app hides a lot of your own history behind a slow list.
            WOTS++ pulls everything together so you can search, filter, and see what happened to
            your reports at a glance.
          </p>
          <p className="mb-3.5">
            This project is not affiliated with WOTS, the City of Jersey City, or its police
            department.
          </p>
        </Section>

        <Section title="Signing in">
          <p className="mb-3.5">
            Sign-in works exactly like the official app: you type your phone number, WOTS texts
            you a 4-digit code, you type it back, and WOTS gives us a sign-in token that stands in
            for your account.
          </p>
          <List>
            <li>
              The <b>4-digit code</b> is used once and thrown away — never saved anywhere.
            </li>
            <li>
              The <b>sign-in token</b> stays in your browser (in "local storage"), not on our
              server. Closing all your browsers eventually clears it; the "log out" button clears
              it immediately.
            </li>
            <li>
              Your <b>phone number</b> is saved in your browser so you don't have to retype it
              when you file a new report.
            </li>
          </List>
        </Section>

        <Section title="What we can see">
          <p className="mb-3.5">
            Once you're signed in, we can see everything WOTS shows you about <b>your own</b>{' '}
            reports — the addresses, photos you attached, comments you wrote, and how the reports
            were resolved. WOTS scopes each request to whoever is signed in, so at any given
            moment our server is only fetching <i>your</i> data from WOTS.
          </p>
          <p className="mb-3.5">
            Here's the fuller picture, though: because every WOTS++ user signs in through the same
            server, our own database ends up holding a closed-report copy for <b>every</b> WOTS++
            user over time, not just you. That pooled data is what the public{' '}
            <A href="/stats">stats page</A> is built on (anonymized), and it's also what the site
            operator has direct read access to on the server. If you'd rather not have your
            reports sitting in someone else's database, use the official WOTS app instead —
            nothing lands here if you don't sign in here.
          </p>
        </Section>

        <Section title="What we save on our server">
          <p className="mb-3.5">
            To make the app faster (WOTS's own servers can take a while), we keep a copy of your{' '}
            <b>closed</b> reports — anything that's been resolved or canceled. A closed report
            doesn't change anymore, so caching it is safe.
          </p>
          <p className="mb-3.5">
            Reports that are still open, waiting, or in progress are <b>not</b> saved on our
            server. We fetch those live from WOTS every time you look at them.
          </p>
          <p className="mb-3.5">The saved copy of a closed report includes:</p>
          <List>
            <li>The type of issue ("Parking in crosswalk", etc.) and the address you filed</li>
            <li>Comments you wrote when submitting</li>
            <li>
              Links to the photos you attached (we save the <i>links</i>, not the photos
              themselves — those still live on WOTS)
            </li>
            <li>The officer information and the resolution text WOTS sent back</li>
            <li>When the report was filed, assigned, and resolved</li>
          </List>
        </Section>

        <Callout>
          <p className="m-0">
            <b>About phone numbers:</b> WOTS attaches your phone number to every incident report
            you file — it's how officers can follow up. We deliberately{' '}
            <b>strip your phone number out of every cached report before saving it</b>, and out of
            every response we hand back to your browser. It's used to authenticate you at sign-in
            and to file new reports, and that's it. It never lands in the database.
          </p>
        </Callout>

        <h3 className="mt-7 mb-2 text-[15px] font-semibold text-text">
          What we do <i>not</i> save on our server
        </h3>
        <List>
          <li>Your sign-in token</li>
          <li>The 4-digit SMS code</li>
          <li>The phone number attached to your incident reports (stripped before write)</li>
          <li>
            Any analytics, tracking pixels, cookies, or telemetry — no Google Analytics, no ad
            networks, nothing
          </li>
          <li>The photo files themselves — only the WOTS links to them</li>
        </List>

        <Section title="The public stats page">
          <p className="mb-3.5">
            We publish a <A href="/stats">public stats page</A> with insights across every closed
            report we've cached — things like "what's the most-reported issue type", "how long
            does the average parking complaint take to resolve", and "which officers close which
            kinds of reports". This is drawn from every user's data pooled together.
          </p>
          <p className="mb-3.5">The stats page is fully anonymized. It never includes:</p>
          <List>
            <li>Report IDs or the internal WOTS user IDs</li>
            <li>Addresses</li>
            <li>Phone numbers</li>
            <li>The comments you wrote</li>
            <li>Photo links</li>
          </List>
          <p className="mb-3.5">
            Only the aggregable dimensions — issue type, resolution phrase (grouped exactly, so
            you can see how often each canned response appears), timestamps, and the officer's
            public role label — go into it. You can look at the{' '}
            <A href="/api/stats">raw data behind the page</A> to confirm.
          </p>
        </Section>

        <Section title="Sharing">
          <p className="mb-3.5">
            We don't share, sell, or hand over your data to anyone. There are exactly two kinds of
            network requests happening:
          </p>
          <List>
            <li>
              Between your browser and this server (<code>wots.hackjc.org</code>)
            </li>
            <li>Between this server and WOTS (proxying your request to their API)</li>
          </List>
          <p className="mb-3.5">That's it. No third-party services, no external analytics.</p>
        </Section>

        <Section title="Clearing your data">
          <p className="mb-3.5">
            <b>In your browser:</b> the log-out button in the header clears your token, phone
            number, and preferences from this browser. That's a one-click operation.
          </p>
          <p className="mb-3.5">
            <b>On our server:</b> the cached copies of your closed reports remain, indexed by an
            internal WOTS user identifier. There's no self-service delete for this yet — if you'd
            like your server-side cache purged,{' '}
            <A href="https://github.com/HackJerseyCity/wots-clone/issues">
              open an issue on the WOTS++ repo
            </A>{' '}
            and we'll do it. The same reports remain available directly from WOTS itself.
          </p>
        </Section>

        <Section title="Source code">
          <p className="mb-3.5">
            Both this app and the library it uses to talk to WOTS are open source:
          </p>
          <List>
            <li>
              <A href="https://github.com/HackJerseyCity/wots-clone">
                github.com/HackJerseyCity/wots-clone
              </A>{' '}
              — this app (server, UI, cache, stats).
            </li>
            <li>
              <A href="https://github.com/HackJerseyCity/wots">github.com/HackJerseyCity/wots</A> —
              the WOTS API client. Its README documents how the WOTS interface works, what fields
              exist, and what data flows across the wire.
            </li>
          </List>
        </Section>

        <hr className="border-0 border-t border-border mt-11 mb-6" />
        <p className="text-muted text-sm">
          Built by HackJC. See the <A href="/terms">terms of use</A>. Questions, corrections, or
          "hey you're doing this wrong" welcome via{' '}
          <A href="https://github.com/HackJerseyCity/wots-clone/issues">
            GitHub issues on the WOTS++ repo
          </A>
          .
        </p>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="mt-11 mb-3 text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="pl-6 mb-3.5 space-y-1.5 list-disc">{children}</ul>;
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 py-3.5 px-4 rounded-lg text-[15px] bg-surface-2 border-l-[3px] border-accent">
      {children}
    </div>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-accent hover:underline">
      {children}
    </a>
  );
}

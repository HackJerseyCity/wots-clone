import Header from '../components/Header';
import { usePageTitle } from '../hooks/usePageTitle';

export default function TermsPage() {
  usePageTitle('WOTS++ · Terms of Use');
  return (
    <>
      <Header />
      <main className="max-w-[720px] mx-auto px-6 py-[clamp(28px,5vw,56px)] leading-[1.6]">
        <h1 className="text-[clamp(26px,5vw,32px)] font-semibold tracking-tight mb-2">
          Terms of Use
        </h1>
        <p className="text-muted text-[15px] mb-8">
          By using WOTS++, you agree to these terms. They're deliberately short.
        </p>

        <h2 className="mt-8 mb-2.5 text-lg font-semibold tracking-tight">As-is, no warranty</h2>
        <p className="mb-3.5">
          WOTS++ is a free, unofficial hobby project. It is not affiliated with WOTS, the City of
          Jersey City, its police department, or any other government agency. It is provided{' '}
          <b>as-is</b> and <b>as-available</b>, with no warranties of any kind — no guarantee of
          uptime, accuracy, security, completeness, or continued existence. Data shown here may be
          wrong, out of date, or missing entirely. The site may go offline or disappear without
          notice.
        </p>

        <h2 className="mt-8 mb-2.5 text-lg font-semibold tracking-tight">No liability</h2>
        <p className="mb-3.5">
          To the maximum extent permitted by law, the operator of this site is <b>not liable</b>{' '}
          for any damages — direct, indirect, incidental, consequential, or otherwise — arising
          from your use of WOTS++, from anything WOTS itself does or fails to do, or from any
          decisions you make based on information shown here. This includes, without limitation,
          situations where a report you filed through WOTS++ wasn't received, wasn't acted on, was
          mishandled, or produced an outcome you didn't expect.
        </p>
        <div className="my-4 py-3 px-4 rounded-lg text-[15px] bg-warn-bg text-warn-fg border-l-[3px] border-warn-fg">
          <p className="m-0">
            <b>WOTS++ is not for emergencies.</b> If someone is hurt or in danger, call 911.
          </p>
        </div>

        <h2 className="mt-8 mb-2.5 text-lg font-semibold tracking-tight">Real reports go to real people</h2>
        <p className="mb-3.5">
          Signing in through WOTS++ signs you in to your actual WOTS account. Reports you file
          here are real reports sent to real enforcement officers, and they may result in real
          citations against real people. WOTS's own terms of service and any applicable local,
          state, and federal laws also apply — don't file fake reports, don't harass anyone, don't
          use the service for anything you wouldn't do through the official app.
        </p>

        <h2 className="mt-8 mb-2.5 text-lg font-semibold tracking-tight">Data</h2>
        <p className="mb-3.5">
          See the <a className="text-accent hover:underline" href="/about">About page</a> for a
          full account of what we save, what we don't, and how to have your server-side data
          purged.
        </p>

        <h2 className="mt-8 mb-2.5 text-lg font-semibold tracking-tight">Changes</h2>
        <p className="mb-3.5">
          These terms may change without notice. Continued use of WOTS++ after a change means you
          accept the new version. There's no notification list — check back if it matters to you.
        </p>

        <p className="text-muted text-sm mt-10">
          Questions via{' '}
          <a className="text-accent hover:underline" href="https://github.com/HackJerseyCity/wots-clone/issues">
            GitHub issues on the WOTS++ repo
          </a>
          .
        </p>
      </main>
    </>
  );
}

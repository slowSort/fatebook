import Link from "next/link"

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen ">
      {/* <NavbarGeneric /> */}
      <div className="bg-gray-50 grow">
        <div className="px-4 pt-12 lg:pt-16 mx-auto max-w-6xl">
          <div className="prose mx-auto">
            <h2 className="text-3xl mb-2 font-extrabold text-gray-900">
              Fatebook
            </h2>
            <h3 className="text-gray-600">Track your predictions, make better decisions</h3>

            <p><Link href="/for-slack"><b>Fatebook for Slack</b></Link>: available for alpha testers.</p>

            <p><b>Fatebook for web</b>: coming soon.</p>

            <p>{"We'd love your feedback at"} <a href="mailto:hello@sage-future.org">hello@sage-future.org</a> or on <Link href="https://discord.gg/mt9YVB8VDE">Discord</Link>.</p>

            <h3 className="text-lg font-semibold mt-12">Check out Sage{"'"}s other tools on <Link href="https://www.quantifiedintuitions.org/">Quantified Intuitions</Link></h3>
          </div>

          {/* <div className="max-w-xs mt-12 mb-6 m-auto">
            <MailingListSignup buttonText="Subscribe to hear about our next tool" tags={["homepage"]} />
          </div> */}
        </div>
      </div>
      {/* <Footer /> */}
    </div >
  )
}
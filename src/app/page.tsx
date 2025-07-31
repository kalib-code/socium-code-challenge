import { CVForm } from "~/app/_components/cv-form";
import { HydrateClient } from "~/trpc/server";

export default async function Home() {

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="container flex flex-col items-center gap-12 px-4 py-16">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            CV <span className="text-[hsl(280,100%,70%)]">Portal</span>
          </h1>
          <CVForm />
        </div>
      </main>
    </HydrateClient>
  );
}

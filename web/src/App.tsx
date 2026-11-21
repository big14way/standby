import { Checked, Evidence } from "./sections/Cards";
import { Closer, Footer } from "./sections/Closer";
import { Console } from "./sections/Console";
import { Faq } from "./sections/Faq";
import { Flow } from "./sections/Flow";
import { Hero } from "./sections/Hero";
import { Nav } from "./sections/Nav";
import { Proof } from "./sections/Proof";
import { Story } from "./sections/Story";

export function App() {
  return (
    <div className="page">
      <Nav />
      <main>
        <Hero />
        <Flow />
        <Evidence />
        <Proof />
        <Console />
        <Story />
        <Checked />
        <Faq />
        <Closer />
      </main>
      <Footer />
    </div>
  );
}

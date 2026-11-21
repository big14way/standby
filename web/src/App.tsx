import { Hero } from "./sections/Hero";
import { Nav } from "./sections/Nav";

export function App() {
  return (
    <div className="page">
      <Nav />
      <main>
        <Hero />
      </main>
    </div>
  );
}

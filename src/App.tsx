import { getPlatform } from "./platform";
import "./App.css";

function App() {
  const mode = getPlatform().mode;
  return (
    <main className="container">
      <h1>Firebase Editor Pro</h1>
      <p data-testid="platform-mode">Mode: {mode}</p>
    </main>
  );
}

export default App;

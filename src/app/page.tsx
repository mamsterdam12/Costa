import { redirect } from "next/navigation";

// The platform will eventually cover every touristic region in Spain;
// Marbella is the first one live, so the root just opens straight into it.
export default function HomePage() {
  redirect("/marbella");
}

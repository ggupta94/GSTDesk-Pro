import CalculatorClient from "./CalculatorClient";
import { requireUser } from "@/lib/auth";

export default async function CalculatorPage() {
  await requireUser();
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">GST Calculator</h1>
        <p className="text-sm text-slate-600">Inclusive / exclusive computations across all GST slabs.</p>
      </div>
      <CalculatorClient />
    </div>
  );
}

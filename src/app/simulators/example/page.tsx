"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Example Simulator Page
 *
 * This is a template showing how to structure a simulator page.
 * Replace this with your actual simulator logic.
 */
export default function ExampleSimulator() {
  const [input, setInput] = useState(50);
  const [result, setResult] = useState<number | null>(null);

  const runSimulation = () => {
    // Replace with your actual simulation logic
    setResult(input * Math.random() * 2);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/dashboard"
          className="text-blue-600 hover:text-blue-800 text-sm mb-6 inline-block"
        >
          ← Back to Dashboard
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Example Simulator
        </h1>
        <p className="text-gray-600 mb-8">
          This is a placeholder. Replace with your actual simulator.
        </p>

        <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
          {/* Input Controls */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Input Parameter: {input}
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={input}
              onChange={(e) => setInput(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Run Button */}
          <button
            onClick={runSimulation}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Run Simulation
          </button>

          {/* Results */}
          {result !== null && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900">Result</h3>
              <p className="text-2xl font-mono text-blue-700">
                {result.toFixed(4)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

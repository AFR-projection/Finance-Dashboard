"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Insight = {
  id: string;
  title: string;
  body: string;
  severity: string;
};

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/insights");
      const json = await res.json();
      setInsights(json.data?.items ?? []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-5 pt-1 lg:space-y-6 lg:pt-8">
      <div>
        <p className="app-eyebrow mb-1">Proactive intelligence</p>
        <h1 className="app-page-title">AI Insights</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Hal penting yang ditemukan dari pola keuanganmu.</p>
      </div>
      {loading && <p>Generating insights...</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {insights.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card className="app-surface rounded-[1.5rem] ring-0">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">{item.title}</CardTitle>
                <Badge variant="outline">{item.severity}</Badge>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-foreground/80">
                {item.body}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

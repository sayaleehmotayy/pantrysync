import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, TrendingUp, Users, Coins } from "lucide-react";

interface FeatureRow {
  feature: string;
  calls: number;
  avg_cost_eur: number;
  max_cost_eur: number;
  avg_credits: number;
  avg_revenue_eur: number;
  margin_pct: number;
  unprofitable_alert: boolean;
}
interface TopUserRow {
  user_id: string;
  display_name: string;
  product_id: string;
  calls: number;
  total_credits: number;
  total_cost_eur: number;
  revenue_at_min_topup: number;
  unprofitable: boolean;
}
interface PlanRow {
  plan: string;
  subscribers: number;
  avg_credits_used: number;
  avg_cost_eur: number;
  total_cost_eur: number;
}
interface SummaryRow {
  calls: number;
  credits_used: number;
  ai_cost_eur: number;
  subscription_revenue_eur: number;
  topup_revenue_eur: number;
  total_revenue_eur: number;
  margin_pct: number;
  unprofitable_alert: boolean;
}

const ADMIN_EMAIL = "pantrysync9@gmail.com";

export default function AdminMarginsPage() {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [topUsers, setTopUsers] = useState<TopUserRow[]>([]);
  const [perPlan, setPerPlan] = useState<PlanRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [f, t, p, s] = await Promise.all([
        supabase.from("ai_cost_summary_30d" as any).select("*"),
        supabase.from("ai_cost_top_users_30d" as any).select("*"),
        supabase.from("ai_credits_used_per_plan" as any).select("*"),
        supabase.from("ai_revenue_vs_cost_30d" as any).select("*").maybeSingle(),
      ]);
      if (cancelled) return;
      setFeatures((f.data as any) || []);
      setTopUsers((t.data as any) || []);
      setPerPlan((p.data as any) || []);
      setSummary((s.data as any) || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            This page is for the app admin only.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">AI Margin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Last 30 days · live data</p>
      </div>

      {/* Summary */}
      {summary && (
        <Card className={summary.unprofitable_alert ? "border-destructive" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4" /> Revenue vs AI cost
              {summary.unprofitable_alert && (
                <Badge variant="destructive" className="ml-auto">UNPROFITABLE</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-muted-foreground">Subscription revenue</div><div className="font-semibold">€{summary.subscription_revenue_eur}</div></div>
            <div><div className="text-muted-foreground">Top-up revenue</div><div className="font-semibold">€{summary.topup_revenue_eur}</div></div>
            <div><div className="text-muted-foreground">AI cost</div><div className="font-semibold">€{summary.ai_cost_eur}</div></div>
            <div><div className="text-muted-foreground">Margin</div><div className={`font-semibold ${summary.margin_pct < 40 ? "text-destructive" : "text-primary"}`}>{summary.margin_pct}%</div></div>
            <div className="col-span-2 text-xs text-muted-foreground">{summary.calls.toLocaleString()} AI calls · {summary.credits_used.toLocaleString()} credits used</div>
          </CardContent>
        </Card>
      )}

      {/* Per-feature margin */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="w-4 h-4" /> Margin per feature
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && features.length === 0 && <p className="text-sm text-muted-foreground">No AI calls logged yet.</p>}
          {features.map((f) => (
            <div key={f.feature} className="flex items-center justify-between border rounded-lg p-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {f.feature}
                  {f.unprofitable_alert && <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />}
                </div>
                <div className="text-xs text-muted-foreground">
                  {f.calls} calls · avg €{f.avg_cost_eur} cost · {f.avg_credits} cr revenue €{f.avg_revenue_eur}
                </div>
              </div>
              <div className={`font-semibold ml-3 ${f.margin_pct < 40 ? "text-destructive" : f.margin_pct < 60 ? "text-amber-500" : "text-primary"}`}>
                {f.margin_pct}%
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Per-plan averages */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" /> Avg credits used per plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {perPlan.map((p) => (
            <div key={p.plan} className="flex justify-between items-center border rounded-lg p-3 text-sm">
              <div>
                <div className="font-medium capitalize">{p.plan}</div>
                <div className="text-xs text-muted-foreground">{p.subscribers} subs · €{p.total_cost_eur} total cost</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{p.avg_credits_used} cr</div>
                <div className="text-xs text-muted-foreground">€{p.avg_cost_eur}/user</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Top 10 expensive users */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top 10 most expensive users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {topUsers.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
          {topUsers.map((u, i) => (
            <div key={u.user_id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  #{i + 1} {u.display_name}
                  {u.unprofitable && <Badge variant="destructive" className="ml-2 text-[10px]">LOSS</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{u.product_id} · {u.calls} calls · {u.total_credits} cr</div>
              </div>
              <div className="text-right ml-2">
                <div className="font-semibold">€{u.total_cost_eur}</div>
                <div className="text-xs text-muted-foreground">rev €{u.revenue_at_min_topup}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

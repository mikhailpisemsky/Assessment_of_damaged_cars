
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:8000/api/v1";

type Factor = {
  name: string; value: string | number;
  impact: string; weight: number; source: string;
};

type Offer = {
  source: string; price: number; url: string;
  published_at: string; fetched_at: string;
};

type Item = {
  id: string; part: string; oem: string | null; suitability: string;
  confidence: number; factors: Factor[]; median_price: number | null;
  manual_price: number | null; offers_count: number; offers: Offer[];
  data_quality_flag: string; included_in_total: boolean; reference_price: number | null;
};

type Assessment = {
  id: string; status: string; stage: string;
  vehicle: { make: string; model: string; year: number; vin: string | null; source: string };
  mileage: number; damage_description: string; region: string;
  disassembly_cost: number; sum_median_included: number; recommended_total: number;
  created_at: string | null; calculated_at: string | null; items: Item[];
};

const SUITABILITY_RU: Record<string, string> = {
  usable: "Годна", conditionally: "Условно", not_usable: "Не годна",
};
const FLAG_RU: Record<string, string> = {
  ok: "ok", low_data_confidence: "мало данных", no_market_price: "нет цен",
};
const SOURCE_RU: Record<string, string> = {
  image: "Фото", text: "Описание", structured: "Данные", rule: "Правило",
};

const STAGES = ["queued", "catalog", "ai", "parsing", "calculated"];

function money(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽";
}

export default function App() {
  const [form, setForm] = useState({
    make: "", model: "", year: 2018, vin: "", mileage: 98000,
    damage_description: "", disassembly_cost: 50000,
  });
  const [id, setId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ status: string; stage: string } | null>(null);
  const [data, setData] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [showFactors, setShowFactors] = useState<Record<string, boolean>>({});

  async function createAssessment() {
    setError("");
    if (!form.make || !form.model || !form.damage_description) {
      setError("Заполните марку, модель и описание повреждений");
      return;
    }
    const res = await fetch(`${API}/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, vin: form.vin || null }),
    });
    if (!res.ok) { setError("Ошибка создания оценки"); return; }
    const json = await res.json();
    setId(json.assessment_id);
    setStatus({ status: json.status, stage: json.stage });
    setData(null);
  }

  useEffect(() => {
    if (!id || !status || status.status === "calculated") return;
    const t = setInterval(async () => {
      const res = await fetch(`${API}/assessments/${id}/status`);
      const s = await res.json();
      setStatus(s);
      if (s.status === "calculated") {
        const full = await fetch(`${API}/assessments/${id}`);
        setData(await full.json());
      }
    }, 700);
    return () => clearInterval(t);
  }, [id, status]);

  async function patchItem(itemId: string, patch: { included_in_total?: boolean; manual_price?: number | null }) {
    if (!id) return;
    await fetch(`${API}/assessments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ item_id: itemId, ...patch }] }),
    });
    const full = await fetch(`${API}/assessments/${id}`);
    setData(await full.json());
  }

  async function patchDisassembly(value: number) {
    if (!id) return;
    await fetch(`${API}/assessments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disassembly_cost: value }),
    });
    const full = await fetch(`${API}/assessments/${id}`);
    setData(await full.json());
  }

  const stageIdx = status ? STAGES.indexOf(status.stage) : -1;

  return (
    <div className="app">
      <h1>Оценка автомобиля и стоимости запасных частей</h1>

      {!id && (
        <section className="card">
          <h2>Новая оценка</h2>
          <div className="form-grid">
            <label>Марка <input value={form.make} onChange={e => setForm({ ...form, make: e.target.value })} /></label>
            <label>Модель <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></label>
            <label>Год <input type="number" value={form.year} onChange={e => setForm({ ...form, year: +e.target.value })} /></label>
            <label>VIN (необязательно) <input value={form.vin} onChange={e => setForm({ ...form, vin: e.target.value })} /></label>
            <label>Пробег, км <input type="number" value={form.mileage} onChange={e => setForm({ ...form, mileage: +e.target.value })} /></label>
            <label>Стоимость разборки, ₽ <input type="number" value={form.disassembly_cost} onChange={e => setForm({ ...form, disassembly_cost: +e.target.value })} /></label>
          </div>
          <label className="full">
            Описание повреждений
            <textarea rows={3} value={form.damage_description}
              onChange={e => setForm({ ...form, damage_description: e.target.value })}
              placeholder="Например: удар в переднее левое крыло, разрушена подвеска" />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={createAssessment}>Создать оценку</button>
        </section>
      )}

      {id && status && status.status !== "calculated" && (
        <section className="card">
          <h2>Обработка…</h2>
          <div className="stages">
            {STAGES.slice(1).map((s, i) => (
              <div key={s} className={"stage" + (i < stageIdx ? " done" : i === stageIdx ? " active" : "")}>
                {s === "catalog" ? "Каталог" : s === "ai" ? "AI-анализ" : s === "parsing" ? "Сбор цен" : "Готово"}
              </div>
            ))}
          </div>
        </section>
      )}

      {data && (
        <>
          <section className="card">
            <h2>{data.vehicle.make} {data.vehicle.model}, {data.vehicle.year} · пробег {data.mileage.toLocaleString("ru-RU")} км</h2>
            <p className="muted">{data.damage_description}</p>
            <div className="totals">
              <div><span className="muted">Сумма включённых:</span> <b>{money(data.sum_median_included)}</b></div>
              <div>
                <span className="muted">Разборка:</span>{" "}
                <input className="money" type="number" defaultValue={data.disassembly_cost}
                  onBlur={e => { const v = +e.target.value; if (v !== data.disassembly_cost) patchDisassembly(v); }} />
              </div>
              <div className="total"><span className="muted">Итого рекомендовано:</span> <b>{money(data.recommended_total)}</b></div>
            </div>
            <button onClick={() => window.open(`${API}/assessments/${data.id}/export`, "_blank")}>
              Скачать JSON-отчёт
            </button>
          </section>

          <section className="card">
            <h2>Детали ({data.items.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>В расчёте</th><th>Деталь</th><th>Решение</th><th>Уверенность</th>
                  <th>Цены</th><th>Медиана</th><th>Ручная цена</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(it => (
                  <tr key={it.id} className={`row-${it.suitability}`}>
                    <td>
                      <input type="checkbox" checked={it.included_in_total}
                        disabled={it.data_quality_flag === "no_market_price" && it.manual_price === null}
                        onChange={e => patchItem(it.id, { included_in_total: e.target.checked })} />
                    </td>
                    <td>
                      <b>{it.part}</b>
                      <div className="flag flag-{it.data_quality_flag}">{FLAG_RU[it.data_quality_flag]} · {it.offers_count} объявл.</div>
                      <details open={!!showFactors[it.id]}
                        onToggle={e => setShowFactors({ ...showFactors, [it.id]: (e.target as HTMLDetailsElement).open })}>
                        <summary>Почему ({it.factors.length} фактора)</summary>
                        <ul className="factors">
                          {it.factors.map((f, i) => (
                            <li key={i}>
                              <span className={"impact " + f.impact}>
                                {f.impact === "negative" ? "🔴" : f.impact === "positive" ? "🟢" : "⚪"}
                              </span>
                              {SOURCE_RU[f.source]}: {String(f.value)} <b>({Math.round(f.weight * 100)}%)</b>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    <td>{SUITABILITY_RU[it.suitability]}</td>
                    <td>{Math.round(it.confidence * 100)}%</td>
                    <td>
                      {it.offers.slice(0, 3).map((o, i) => (
                        <div key={i} className="offer">
                          <a href={o.url} target="_blank" rel="noreferrer">{o.source}</a>: {money(o.price)}
                        </div>
                      ))}
                      {it.offers.length > 3 && <div className="muted">+{it.offers.length - 3} ещё</div>}
                    </td>
                    <td>{money(it.median_price)}</td>
                    <td>
                      <input className="money" type="number" placeholder="—" defaultValue={it.manual_price ?? ""}
                        onBlur={e => {
                          const v = e.target.value === "" ? null : +e.target.value;
                          if (v !== it.manual_price) patchItem(it.id, { manual_price: v });
                        }} />
                    </td>
                    <td className="muted">{it.reference_price ? `справочно ${money(it.reference_price)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <button className="link" onClick={() => { setId(null); setStatus(null); setData(null); }}>
            ← Новая оценка
          </button>
        </>
      )}
    </div>
  );
}

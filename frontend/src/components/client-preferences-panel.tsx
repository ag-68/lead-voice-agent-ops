"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ClientPreferences,
  fetchClientPreferences,
  saveClientPreferences,
} from "@/lib/api";

type Choice = { id: string; label: string };

function join(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "any";
}

function withDraft(selected: string[], draft: string): string[] {
  const next = [...selected];
  for (const part of draft.split(",")) {
    const text = part.trim().replace(/\s+/g, " ");
    if (!text) continue;
    if (!next.some((item) => item.toLowerCase() === text.toLowerCase())) next.push(text);
  }
  return next;
}

function ChoiceGroup({
  label,
  hint,
  choices,
  selected,
  onToggle,
  draft,
  onDraft,
  onAdd,
  placeholder,
}: {
  label: string;
  hint: string;
  choices: Choice[];
  selected: string[];
  onToggle: (id: string) => void;
  draft?: string;
  onDraft?: (value: string) => void;
  onAdd?: () => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => {
          const on = selected.includes(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(choice.id)}
              className={
                on
                  ? "rounded-full border border-foreground bg-foreground px-3 py-1 text-sm text-background"
                  : "rounded-full border border-border bg-background px-3 py-1 text-sm hover:bg-muted"
              }
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      {onAdd && onDraft && (
        <div className="flex gap-2">
          <Input
            value={draft ?? ""}
            placeholder={placeholder}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAdd();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={onAdd}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

export function ClientPreferencesPanel() {
  const [sectors, setSectors] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [employees, setEmployees] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [options, setOptions] = useState<ClientPreferences["options"] | null>(null);
  const [sectorDraft, setSectorDraft] = useState("");
  const [serviceDraft, setServiceDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchClientPreferences()
      .then((data) => {
        if (cancelled) return;
        setSectors(data.sectors);
        setRegions(data.regions);
        setEmployees(data.employee_bands);
        setServices(data.services);
        setOptions(data.options);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load client preferences.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(list: string[], value: string, setList: (next: string[]) => void) {
    setMessage("");
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function addSector() {
    setSectors(withDraft(sectors, sectorDraft));
    setSectorDraft("");
    setMessage("");
  }

  function addService() {
    setServices(withDraft(services, serviceDraft));
    setServiceDraft("");
    setMessage("");
  }

  async function save() {
    const nextSectors = withDraft(sectors, sectorDraft);
    const nextServices = withDraft(services, serviceDraft);
    setSectors(nextSectors);
    setServices(nextServices);
    setSectorDraft("");
    setServiceDraft("");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveClientPreferences({
        sectors: nextSectors,
        regions,
        employee_bands: employees,
        services: nextServices,
      });
      setSectors(saved.sectors);
      setRegions(saved.regions);
      setEmployees(saved.employee_bands);
      setServices(saved.services);
      setMessage("Saved. The next scored lead uses these choices.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save client preferences.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading client preferences…</p>;
  }

  if (!options) {
    return <p className="text-sm text-destructive">{error || "Could not load client preferences."}</p>;
  }

  const sectorChoices = uniqueChoices(options.sectors, sectors);
  const serviceChoices = uniqueChoices(options.services, services);
  const regionLabels = regions.map((id) => options.regions.find((item) => item.id === id)?.label || id);
  const employeeLabels = employees.map(
    (id) => options.employee_bands.find((item) => item.id === id)?.label || id
  );
  const preview = [
    "Ideal client:",
    `- Sectors: ${join(sectors)}`,
    `- Regions: ${join(regionLabels)}`,
    `- Employees: ${join(employeeLabels)}`,
    `- Likely needs: ${join(services)}`,
    "Score a lead higher when the company matches this ideal client.",
  ].join("\n");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client Preferences</CardTitle>
        <CardDescription>
          These choices replace the fixed ideal-client sentence. The next scored lead sends them to the model as a short list. A missing model key still uses the name list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ChoiceGroup
          label="Sector"
          hint="Industries you want. Click a chip, or add your own."
          choices={sectorChoices}
          selected={sectors}
          onToggle={(id) => toggle(sectors, id, setSectors)}
          draft={sectorDraft}
          onDraft={setSectorDraft}
          onAdd={addSector}
          placeholder="Add a sector, then press Enter"
        />
        <ChoiceGroup
          label="Region"
          hint="Where the company should operate."
          choices={options.regions}
          selected={regions}
          onToggle={(id) => toggle(regions, id, setRegions)}
        />
        <ChoiceGroup
          label="Number of employees"
          hint="Company size you want."
          choices={options.employee_bands}
          selected={employees}
          onToggle={(id) => toggle(employees, id, setEmployees)}
        />
        <ChoiceGroup
          label="Service or tool they may need"
          hint="What the lead is likely to need from you."
          choices={serviceChoices}
          selected={services}
          onToggle={(id) => toggle(services, id, setServices)}
          draft={serviceDraft}
          onDraft={setServiceDraft}
          onAdd={addService}
          placeholder="Add a service, then press Enter"
        />
        <div className="space-y-2">
          <p className="text-sm font-medium">Sent to the model</p>
          <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            {preview}
          </pre>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function uniqueChoices(suggestions: string[], selected: string[]): Choice[] {
  const ids = [...suggestions];
  for (const item of selected) {
    if (!ids.some((id) => id.toLowerCase() === item.toLowerCase())) ids.push(item);
  }
  return ids.map((id) => ({ id, label: id }));
}

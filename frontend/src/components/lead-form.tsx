"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createLead, LeadFormData } from "@/lib/api";

interface LeadFormProps {
  onSuccess: () => void;
}

const sampleLeads: LeadFormData[] = [
  {
    name: "Sarah Chen",
    email: "sarah.chen@meta.com",
    company_name: "Meta",
    job_title: "VP of Product",
    phone: "+1-555-0100",
    message: "Interested in exploring ElevenLabs for our customer support automation. We handle millions of interactions daily.",
  },
  {
    name: "Michael Rodriguez",
    email: "m.rodriguez@deutschetelekom.de",
    company_name: "Deutsche Telekom",
    job_title: "Head of AI Innovation",
    phone: "+49-555-0200",
    message: "Looking to implement voice AI for our call centers across Europe. Need enterprise-grade security and GDPR compliance.",
  },
  {
    name: "Emily Watson",
    email: "ewatson@acmestartup.io",
    company_name: "Acme Startup Labs",
    job_title: "CTO",
    phone: "+1-555-0300",
    message: "Building a podcast platform and need text-to-speech capabilities. Starting with 10k monthly requests.",
  },
  {
    name: "James Park",
    email: "jpark@globalfintech.com",
    company_name: "GlobalFintech Corp",
    job_title: "Director of Engineering",
    phone: "+1-555-0400",
    message: "Evaluating voice solutions for our banking chatbot. Need SOC2 compliance and low latency.",
  },
];

export function LeadForm({ onSuccess }: LeadFormProps) {
  const [formData, setFormData] = useState<LeadFormData>({
    name: "",
    email: "",
    company_name: "",
    job_title: "",
    phone: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await createLead(formData);
      setFormData({
        name: "",
        email: "",
        company_name: "",
        job_title: "",
        phone: "",
        message: "",
      });
      onSuccess();
    } catch (err) {
      setError("Failed to submit lead. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fillSample = (sample: LeadFormData) => {
    setFormData(sample);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit Enterprise Lead</CardTitle>
        <CardDescription>
          Simulate an inbound lead submission. The pipeline will automatically enrich and score the lead.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <p className="text-sm text-muted-foreground mb-2">Quick fill with sample data:</p>
          <div className="flex flex-wrap gap-2">
            {sampleLeads.map((sample, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                onClick={() => fillSample(sample)}
              >
                {sample.company_name}
              </Button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email *</label>
              <Input
                required
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@company.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Company *</label>
              <Input
                required
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Job Title</label>
              <Input
                value={formData.job_title}
                onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                placeholder="VP of Engineering"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Phone</label>
            <Input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1-555-0123"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Message</label>
            <Textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Tell us about your use case..."
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Submitting..." : "Submit Lead"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

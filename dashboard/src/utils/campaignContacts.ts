export interface CampaignRecipient {
  phone: string;
  label: string;
}

export function parsePhoneNumbers(raw: string): string[] {
  const seen = new Set<string>();
  const numbers: string[] = [];
  for (const line of raw.split(/[\r\n,;]+/)) {
    const digits = line.replace(/[^\d]/g, '');
    if (digits.length < 8 || seen.has(digits)) continue;
    seen.add(digits);
    numbers.push(digits);
  }
  return numbers;
}

export async function parseContactsFile(file: File): Promise<string[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstDigits = lines[0].replace(/[^\d]/g, '');
  const looksLikeHeader =
    lines.length > 1 &&
    firstDigits.length < 8 &&
    /phone|tel|numero|numéro|mobile|contact/i.test(lines[0]);

  const body = looksLikeHeader ? lines.slice(1) : lines;
  const numbers: string[] = [];
  const seen = new Set<string>();

  for (const line of body) {
    const cell = line.split(/[,;\t]/)[0] ?? line;
    const digits = cell.replace(/[^\d]/g, '');
    if (digits.length < 8 || seen.has(digits)) continue;
    seen.add(digits);
    numbers.push(digits);
  }
  return numbers;
}

export function estimateCampaignMinutes(
  recipientCount: number,
  avgDelayMs = 6500,
): number {
  return Math.max(1, Math.ceil((recipientCount * avgDelayMs) / 60_000));
}

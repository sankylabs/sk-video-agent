/**
 * GHL calendar invite / appointment subject lines.
 *
 * One child:   Trial for <name> (<age> yr old)
 * Two kids:    Trial for <name> (<age> yr old) and <name> (<age> yr old)
 * Three kids:  Trial for <name> (<age> yr old), <name> (<age> yr old) and <name> (<age> yr old)
 *
 * Same parent may book 1–3 kids into the same trial slot (1 is normal; 2 rare; 3 very rare).
 */

export type TrialChild = {
  name?: string;
  age?: string;
};

const MAX_CHILDREN = 3;

/** Normalize age to a short number string when possible (e.g. "10 years" → "10"). */
function normalizeAge(age?: string): string | undefined {
  const raw = age?.trim();
  if (!raw) return undefined;
  const m = raw.match(/\d{1,2}/);
  return m?.[0] || raw;
}

function childPhrase(child: TrialChild): string | null {
  const name = child.name?.trim();
  if (!name) return null;
  const age = normalizeAge(child.age);
  return age ? `${name} (${age} yr old)` : name;
}

export function collectTrialChildren(input: {
  childName?: string;
  childAge?: string;
  childName2?: string;
  childAge2?: string;
  childName3?: string;
  childAge3?: string;
  children?: TrialChild[];
}): TrialChild[] {
  if (input.children?.length) {
    return input.children.filter((c) => c.name?.trim()).slice(0, MAX_CHILDREN);
  }
  const kids: TrialChild[] = [];
  if (input.childName?.trim()) {
    kids.push({ name: input.childName, age: input.childAge });
  }
  if (input.childName2?.trim()) {
    kids.push({ name: input.childName2, age: input.childAge2 });
  }
  if (input.childName3?.trim()) {
    kids.push({ name: input.childName3, age: input.childAge3 });
  }
  return kids.slice(0, MAX_CHILDREN);
}

export function buildTrialSubject(
  input:
    | TrialChild[]
    | {
        childName?: string;
        childAge?: string;
        childName2?: string;
        childAge2?: string;
        childName3?: string;
        childAge3?: string;
        children?: TrialChild[];
      },
): string {
  const kids = Array.isArray(input) ? input.slice(0, MAX_CHILDREN) : collectTrialChildren(input);
  const phrases = kids.map(childPhrase).filter((p): p is string => Boolean(p));

  if (!phrases.length) return "Steamoji Free Session";
  if (phrases.length === 1) return `Trial for ${phrases[0]}`;
  if (phrases.length === 2) return `Trial for ${phrases[0]} and ${phrases[1]}`;
  return `Trial for ${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

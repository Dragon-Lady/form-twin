export type FieldKind =
  | "text"
  | "id"
  | "zip"
  | "phone"
  | "member"
  | "group"
  | "date"
  | "number"
  | "custom";
export interface Field {
  id: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
}
export interface Section {
  id: string;
  name: string;
  description: string;
  dated: boolean;
  fields: Field[];
  custom?: boolean;
}
export interface Period {
  from: string;
  to: string | null;
  current: boolean;
}
export interface Entry {
  id: string;
  sectionId: string;
  fields: Record<string, string>;
  period?: Period;
  createdAt: string;
  updatedAt: string;
}
export interface History {
  id: string;
  entryId: string;
  savedAt: string;
  entry: Entry;
}
export type WindowRule =
  | { kind: "last"; months: number }
  | { kind: "since"; from: string }
  | { kind: "custom"; from: string; to: string };
export interface Requirement {
  sectionId: string;
  window: WindowRule | null;
}
export interface Profile {
  id: string;
  name: string;
  requirements: Requirement[];
}
export interface Backup {
  schemaVersion: 1;
  exportedAt: string;
  sections: Section[];
  entries: Entry[];
  history: History[];
  profiles: Profile[];
}
export interface Snapshot {
  sections: Section[];
  entries: Entry[];
  history: History[];
  profiles: Profile[];
}
export type Clock = () => string;
export const builtins: Section[] = [
  {
    id: "about",
    name: "About me",
    description: "Names, birth date and the last four digits only.",
    dated: false,
    fields: [
      { id: "legalName", label: "Legal name", kind: "text", required: true },
      {
        id: "otherNames",
        label: "Other names used (include dates)",
        kind: "text",
      },
      { id: "birthDate", label: "Date of birth", kind: "date" },
      { id: "idLast4", label: "ID number — last four only", kind: "id" },
    ],
  },
  {
    id: "addresses",
    name: "Addresses",
    description: "Where you lived, and when.",
    dated: true,
    fields: [
      { id: "street", label: "Street", kind: "text", required: true },
      { id: "city", label: "City", kind: "text", required: true },
      { id: "state", label: "State or region", kind: "text" },
      { id: "zip", label: "ZIP or postal code", kind: "zip" },
    ],
  },
  {
    id: "work",
    name: "Work history",
    description: "Roles, employers and dates.",
    dated: true,
    fields: [
      { id: "employer", label: "Employer", kind: "text", required: true },
      { id: "title", label: "Job title", kind: "text" },
      { id: "hours", label: "Hours per week", kind: "number" },
      { id: "reasonLeft", label: "Reason left (optional)", kind: "text" },
    ],
  },
  {
    id: "providers",
    name: "Providers",
    description: "The people and places involved in your care.",
    dated: true,
    fields: [
      { id: "name", label: "Provider name", kind: "text", required: true },
      { id: "specialty", label: "Specialty", kind: "text" },
      { id: "clinic", label: "Clinic", kind: "text" },
      { id: "phone", label: "Phone", kind: "phone" },
      { id: "whatFor", label: "What for", kind: "text" },
    ],
  },
  {
    id: "medicines",
    name: "Medicines",
    description: "Names, doses and the details you need.",
    dated: true,
    fields: [
      { id: "name", label: "Medicine", kind: "text", required: true },
      { id: "dose", label: "Dose", kind: "text" },
      { id: "frequency", label: "How often", kind: "text" },
      { id: "prescriber", label: "Prescriber", kind: "text" },
    ],
  },
  {
    id: "insurance",
    name: "Insurance",
    description: "Plan details and contact numbers.",
    dated: false,
    fields: [
      { id: "plan", label: "Plan name", kind: "text", required: true },
      { id: "memberId", label: "Member ID", kind: "member" },
      { id: "groupNumber", label: "Group number", kind: "group" },
      { id: "phone", label: "Phone", kind: "phone" },
    ],
  },
  {
    id: "contacts",
    name: "Contacts",
    description: "People to contact when it matters.",
    dated: false,
    fields: [
      { id: "name", label: "Contact name", kind: "text", required: true },
      { id: "relationship", label: "Relationship", kind: "text" },
      { id: "phone", label: "Phone", kind: "phone" },
    ],
  },
];
export const allSections = (custom: Section[]) => [...builtins, ...custom];

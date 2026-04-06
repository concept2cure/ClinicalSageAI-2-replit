import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type StandardRef = {
 family: "ISO" | "IEC" | "CLSI" | "ASTM" | "AAMI" | "UL" | "FDA";
 code: string;
 edition_year?: string;
 clause?: string;
 region?: "US" | "EU" | "Global" | "JP" | "CN";
};

export default function StandardsPicker({
 value, onChange, suggestions
}: {
 value?: StandardRef;
 onChange: (s: StandardRef) => void;
 suggestions?: StandardRef[];
}) {
 const v = value || { family: "ISO" as const, code: "" };
 const set = (k: keyof StandardRef, val: any) => onChange({ ...v, [k]: val });

 return (
 <div className="std-picker space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <Label>Family *</Label>
 <Select value={v.family} onValueChange={(val) => set("family", val as StandardRef["family"])}>
 <SelectTrigger data-testid="select-standard-family">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {["ISO", "IEC", "CLSI", "ASTM", "AAMI", "UL", "FDA"].map(f => (
 <SelectItem key={f} value={f}>{f}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label>Code *</Label>
 <Input 
 list="stdcodes" 
 value={v.code} 
 onChange={e => set("code", e.target.value)} 
 placeholder="e.g., 60601-1-2"
 data-testid="input-standard-code"
 />
 <datalist id="stdcodes">
 {(suggestions || []).map(s => (
 <option key={`${s.family}-${s.code}`} value={s.code}>{`${s.family} ${s.code}`}</option>
 ))}
 </datalist>
 </div>
 </div>
 
 <div className="grid grid-cols-3 gap-4">
 <div>
 <Label>Edition Year</Label>
 <Input 
 value={v.edition_year || ""} 
 onChange={e => set("edition_year", e.target.value)} 
 placeholder="2020"
 data-testid="input-edition-year"
 />
 </div>
 <div>
 <Label>Clause/Section</Label>
 <Input 
 value={v.clause || ""} 
 onChange={e => set("clause", e.target.value)} 
 placeholder="e.g., 8.7.4"
 data-testid="input-clause"
 />
 </div>
 <div>
 <Label>Region</Label>
 <Select value={v.region || "Global"} onValueChange={(val) => set("region", val as any)}>
 <SelectTrigger data-testid="select-standard-region">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {["Global", "US", "EU", "JP", "CN"].map(r => (
 <SelectItem key={r} value={r}>{r}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 </div>
 );
}

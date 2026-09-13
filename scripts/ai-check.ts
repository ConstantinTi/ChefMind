/** Einmaliger Live-Test gegen die echte API — prüft, ob das Schema akzeptiert wird. */
import { getAiProvider } from '../src/lib/ai/provider';
import { aiRecipeToDraft } from '../src/lib/ai/schemas';
import { formatQuantity } from '../src/domain/units/format';

const text = `Schnelle Tomatensuppe für 2 Personen.
500 g passierte Tomaten, 1 Zwiebel, 2-3 Zehen Knoblauch, 1 EL Olivenöl,
Salz nach Geschmack, etwas Basilikum.
Zwiebel und Knoblauch im Öl anschwitzen, Tomaten zugeben, 15 Minuten köcheln.`;

const provider = await getAiProvider();
console.log(`Anbieter: ${provider.name} / ${provider.model}`);

const ai = await provider.extractFromText(text);
const draft = aiRecipeToDraft(ai, {
  sourceType: 'own', sourceUrl: null, sourceTitle: null, sourceAuthor: null,
});

console.log(`\nSchema akzeptiert. Ergebnis:`);
console.log(`  Titel:      ${draft.title}`);
console.log(`  Portionen:  ${draft.baseServings}`);
console.log(`  Konfidenz:  ${Math.round(ai.confidence * 100)} %`);
console.log(`  Zutaten:`);
for (const i of draft.ingredients) {
  console.log(`    ${formatQuantity(i.quantity).padEnd(14)} ${i.name}`);
}
console.log(`  Schritte:   ${draft.steps.length}`);
console.log(`  Nährwerte:  ${draft.nutrition ? `${draft.nutrition.kcal} kcal/Portion` : 'keine'}`);
if (ai.warnings.length) console.log(`  Hinweise:   ${ai.warnings.join(' | ')}`);

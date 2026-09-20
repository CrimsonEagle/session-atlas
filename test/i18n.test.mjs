import test from 'node:test';
import assert from 'node:assert/strict';
import {detectSystemLanguage,getLanguageChoice,language,setLanguageChoice,translateGerman} from '../public/i18n.js';

const storage=initial=>{
 const values=new Map(Object.entries(initial||{}));
 return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};
};

test('system language follows the primary browser preference',()=>{
 assert.equal(detectSystemLanguage({languages:['de-DE','en-US']}),'de');
 assert.equal(detectSystemLanguage({languages:['en-US','de-DE']}),'en');
 assert.equal(language('system',{language:'de-AT'}),'de');
 assert.equal(language('system',{language:'fr-FR'}),'en');
});

test('language preference defaults to system and explicit choices persist',()=>{
 const local=storage();
 assert.equal(getLanguageChoice(local),'system');
 setLanguageChoice('en',{storage:local});assert.equal(getLanguageChoice(local),'en');
 setLanguageChoice('system',{storage:local});assert.equal(getLanguageChoice(local),'system');
});

test('translation covers static labels and dynamic usage sentences',()=>{
 assert.equal(translateGerman('Übersicht'),'Overview');
 assert.equal(translateGerman('Letzte 30 Tage'),'Last 30 days');
 assert.equal(translateGerman('3 Antworten ohne bekannten Preis'),'3 responses without a known price');
 assert.equal(translateGerman('Woche ab Donnerstag, 10. September 2026'),'Week of Thursday, 10. September 2026');
 assert.equal(translateGerman('Tokens'),'Tokens');
});

test('translation covers dynamic dialog copy without mixed-language fragments',()=>{
 assert.equal(translateGerman('Tag · 29 Abschnitte'),'Day · 29 periods');
 assert.equal(
  translateGerman('Geschätzter API-Gegenwert des nutzbaren Kontingents: Jede Rohmessung wird auf 100 % hochgerechnet; dargestellt wird anschließend genau ein arithmetischer Mittelwert je gemeldetem 5-Stunden- oder 7-Tage-Fenster.'),
  'Estimated API value of the usable quota: Each raw measurement is extrapolated to 100%; exactly one arithmetic mean is then shown for each reported five-hour or seven-day window.'
 );
 assert.equal(translateGerman('3 Fenstermittel enthalten Messpunkte mit unbekannten Modellpreisen.'),'3 window averages contain measurements with unknown model prices.');
 assert.equal(translateGerman('1 Modellnamen · 925 Antworten ohne Preis'),'1 model name · 925 responses without pricing');
 assert.equal(translateGerman('4 von 8 Fenstermitteln der eingeblendeten Zeitfenster · 12 Messpunkte insgesamt. Die Hochrechnung ist eine lokale Näherung aus API-Preisen, keine Auskunft des Anbieters über ein Geldlimit.'),'4 of 8 window averages across the displayed time windows · 12 measurements in total. The extrapolation is a local approximation based on API prices, not a provider statement about a monetary limit.');
 assert.equal(translateGerman('🇩🇪 Deutsch'),'🇩🇪 German');
 assert.equal(translateGerman('🖥️ Systemsprache'),'🖥️ System language');
});

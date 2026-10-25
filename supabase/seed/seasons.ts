import type { SeasonalFood } from "@/domain/season/calendar";

/**
 * When fruit, vegetables, salads, herbs and mushrooms are in season in Germany: harvested
 * from the open field or the tree (`fresh`), and kept from the harvest (`stored`). The
 * months follow the usual German seasonal calendars (Bundeszentrum für Ernährung,
 * Verbraucherzentrale); a month at the edge of a season counts when the harvest is in full
 * swing then. Greenhouse harvests do not count.
 *
 * The single source for "Passt zur Saison", the page "Was hat gerade Saison?" and whatever
 * reads the season later. Change a food here; nothing else needs to change. A food is found
 * in the catalog by its names (see `foodFor`): add a name where an ingredient is missed.
 * What grows nowhere in Germany (lemons, bananas, avocados) is left out and counts for no
 * season.
 */
// prettier-ignore
export const seasonalFoods: SeasonalFood[] = [
  // Gemüse
  { key: "auberginen", name: "Auberginen", kind: "gemuese", names: ["Aubergine", "Auberginen"], fresh: [7, 8, 9, 10] },
  { key: "blumenkohl", name: "Blumenkohl", kind: "gemuese", names: ["Blumenkohl"], fresh: [6, 7, 8, 9, 10, 11] },
  { key: "brokkoli", name: "Brokkoli", kind: "gemuese", names: ["Brokkoli", "Broccoli"], fresh: [6, 7, 8, 9, 10] },
  { key: "bohnen", name: "Grüne Bohnen", kind: "gemuese", names: ["grüne Bohnen", "Buschbohnen", "Stangenbohnen", "Brechbohnen", "Prinzessbohnen", "Keniabohnen"], fresh: [7, 8, 9, 10] },
  { key: "dicke-bohnen", name: "Dicke Bohnen", kind: "gemuese", names: ["dicke Bohnen", "Saubohnen", "Ackerbohnen"], fresh: [6, 7] },
  { key: "chinakohl", name: "Chinakohl", kind: "gemuese", names: ["Chinakohl"], fresh: [8, 9, 10, 11], stored: [12, 1, 2] },
  { key: "erbsen", name: "Erbsen", kind: "gemuese", names: ["Erbsen", "Zuckerschoten", "Zuckererbsen", "Palerbsen"], unlike: ["Kichererbsen", "Erbsenprotein", "gelbe Erbsen", "Schälerbsen", "Spalterbsen"], fresh: [6, 7, 8] },
  { key: "fenchel", name: "Fenchel", kind: "gemuese", names: ["Fenchel", "Fenchelknolle"], unlike: ["Fenchelsamen", "Fenchelsaat"], fresh: [6, 7, 8, 9, 10] },
  { key: "gruenkohl", name: "Grünkohl", kind: "gemuese", names: ["Grünkohl", "Federkohl"], fresh: [11, 12, 1, 2] },
  { key: "gurken", name: "Gurken", kind: "gemuese", names: ["Gurke", "Gurken", "Salatgurke", "Schmorgurke", "Snackgurken"], unlike: ["Gewürzgurken", "Essiggurken", "saure Gurken", "Senfgurken"], fresh: [6, 7, 8, 9] },
  { key: "karotten", name: "Karotten", kind: "gemuese", names: ["Karotte", "Karotten", "Möhre", "Möhren", "Mohrrüben", "gelbe Rüben", "Bundkarotten"], fresh: [6, 7, 8, 9, 10, 11], stored: [12, 1, 2, 3, 4, 5] },
  { key: "kartoffeln", name: "Kartoffeln", kind: "gemuese", names: ["Kartoffel", "Kartoffeln", "Frühkartoffeln", "Drillinge"], unlike: ["Süßkartoffel", "Süßkartoffeln"], fresh: [6, 7, 8, 9, 10], stored: [11, 12, 1, 2, 3, 4, 5] },
  { key: "knollensellerie", name: "Knollensellerie", kind: "gemuese", names: ["Knollensellerie", "Sellerieknolle", "Sellerie"], unlike: ["Selleriesalz", "Staudensellerie", "Stangensellerie"], fresh: [9, 10, 11], stored: [12, 1, 2, 3, 4] },
  { key: "staudensellerie", name: "Staudensellerie", kind: "gemuese", names: ["Staudensellerie", "Stangensellerie", "Bleichsellerie"], fresh: [7, 8, 9, 10] },
  { key: "kohlrabi", name: "Kohlrabi", kind: "gemuese", names: ["Kohlrabi"], fresh: [5, 6, 7, 8, 9, 10] },
  { key: "kuerbis", name: "Kürbis", kind: "gemuese", names: ["Kürbis", "Hokkaido", "Butternut", "Muskatkürbis", "Spaghettikürbis"], unlike: ["Kürbiskerne", "Kürbiskernöl"], fresh: [9, 10, 11], stored: [12, 1, 2] },
  { key: "lauch", name: "Lauch", kind: "gemuese", names: ["Lauch", "Porree", "Lauchstange", "Lauchstangen"], unlike: ["Bärlauch", "Schnittlauch", "Lauchzwiebel", "Lauchzwiebeln"], fresh: [7, 8, 9, 10, 11, 12, 1, 2, 3] },
  { key: "mais", name: "Zuckermais", kind: "gemuese", names: ["Maiskolben", "Zuckermais", "Mais"], unlike: ["Maismehl", "Maisstärke", "Popcornmais", "Maisgrieß", "Polenta"], fresh: [8, 9, 10] },
  { key: "mangold", name: "Mangold", kind: "gemuese", names: ["Mangold"], fresh: [6, 7, 8, 9, 10] },
  { key: "paprika", name: "Paprika", kind: "gemuese", names: ["Paprika", "Paprikaschote", "Paprikaschoten", "Spitzpaprika"], unlike: ["Paprikapulver", "Paprika edelsüß", "Paprika rosenscharf", "geräuchertes Paprikapulver", "Paprikamark"], fresh: [7, 8, 9, 10] },
  { key: "pastinaken", name: "Pastinaken", kind: "gemuese", names: ["Pastinake", "Pastinaken"], fresh: [10, 11, 12, 1, 2, 3] },
  { key: "petersilienwurzel", name: "Petersilienwurzel", kind: "gemuese", names: ["Petersilienwurzel", "Petersilienwurzeln"], fresh: [10, 11, 12, 1, 2, 3] },
  { key: "radieschen", name: "Radieschen", kind: "gemuese", names: ["Radieschen"], fresh: [4, 5, 6, 7, 8, 9, 10] },
  { key: "rettich", name: "Rettich", kind: "gemuese", names: ["Rettich", "Rettiche"], unlike: ["Meerrettich"], fresh: [5, 6, 7, 8, 9, 10] },
  { key: "rhabarber", name: "Rhabarber", kind: "gemuese", names: ["Rhabarber", "Rhabarberstangen"], fresh: [4, 5, 6] },
  { key: "rote-bete", name: "Rote Bete", kind: "gemuese", names: ["Rote Bete", "Rote Beete", "Rote Rüben", "Randen"], fresh: [7, 8, 9, 10], stored: [11, 12, 1, 2, 3] },
  { key: "rosenkohl", name: "Rosenkohl", kind: "gemuese", names: ["Rosenkohl"], fresh: [10, 11, 12, 1, 2] },
  { key: "rotkohl", name: "Rotkohl", kind: "gemuese", names: ["Rotkohl", "Rotkraut", "Blaukraut"], fresh: [8, 9, 10, 11], stored: [12, 1, 2, 3, 4] },
  { key: "schwarzwurzeln", name: "Schwarzwurzeln", kind: "gemuese", names: ["Schwarzwurzel", "Schwarzwurzeln"], fresh: [10, 11, 12, 1, 2, 3] },
  { key: "spargel", name: "Spargel", kind: "gemuese", names: ["Spargel", "Spargelstangen", "weißer Spargel", "grüner Spargel"], fresh: [4, 5, 6] },
  { key: "spinat", name: "Spinat", kind: "gemuese", names: ["Spinat", "Blattspinat", "Babyspinat", "Wurzelspinat"], fresh: [3, 4, 5, 9, 10, 11] },
  { key: "spitzkohl", name: "Spitzkohl", kind: "gemuese", names: ["Spitzkohl", "Spitzkraut"], fresh: [5, 6, 7, 8, 9, 10] },
  { key: "steckrueben", name: "Steckrüben", kind: "gemuese", names: ["Steckrübe", "Steckrüben", "Kohlrübe"], fresh: [10, 11], stored: [12, 1, 2, 3] },
  { key: "tomaten", name: "Tomaten", kind: "gemuese", names: ["Tomate", "Tomaten", "Rispentomaten", "Strauchtomaten", "Fleischtomaten", "Ochsenherztomaten", "Kirschtomaten", "Cocktailtomaten", "Cherrytomaten", "Datteltomaten", "kleine Tomaten"], unlike: ["gehackte Tomaten", "geschälte Tomaten", "Pizzatomaten", "Tomatenmark"], fresh: [7, 8, 9, 10] },
  { key: "topinambur", name: "Topinambur", kind: "gemuese", names: ["Topinambur"], fresh: [10, 11, 12, 1, 2, 3] },
  { key: "weisskohl", name: "Weißkohl", kind: "gemuese", names: ["Weißkohl", "Weißkraut", "Kraut"], unlike: ["Sauerkraut", "Rotkraut", "Blaukraut", "Spitzkraut", "Bohnenkraut"], fresh: [6, 7, 8, 9, 10, 11], stored: [12, 1, 2, 3, 4] },
  { key: "wirsing", name: "Wirsing", kind: "gemuese", names: ["Wirsing", "Wirsingkohl"], fresh: [6, 7, 8, 9, 10, 11, 12], stored: [1, 2] },
  { key: "zucchini", name: "Zucchini", kind: "gemuese", names: ["Zucchini", "Zucchino"], fresh: [6, 7, 8, 9, 10] },
  { key: "zwiebeln", name: "Zwiebeln", kind: "gemuese", names: ["Zwiebel", "Zwiebeln", "rote Zwiebeln", "Gemüsezwiebel", "Schalotten", "Schalotte"], unlike: ["Frühlingszwiebel", "Frühlingszwiebeln", "Lauchzwiebel", "Lauchzwiebeln", "Röstzwiebeln", "Perlzwiebeln"], fresh: [7, 8, 9, 10], stored: [11, 12, 1, 2, 3, 4, 5, 6] },
  { key: "fruehlingszwiebeln", name: "Frühlingszwiebeln", kind: "gemuese", names: ["Frühlingszwiebel", "Frühlingszwiebeln", "Lauchzwiebel", "Lauchzwiebeln"], fresh: [4, 5, 6, 7, 8, 9, 10] },
  { key: "knoblauch", name: "Knoblauch", kind: "gemuese", names: ["Knoblauch", "Knoblauchzehe", "Knoblauchzehen"], unlike: ["Knoblauchpulver", "Knoblauchgranulat"], fresh: [7, 8], stored: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6] },

  // Salat
  { key: "feldsalat", name: "Feldsalat", kind: "salat", names: ["Feldsalat", "Rapunzel", "Ackersalat"], fresh: [10, 11, 12, 1, 2, 3] },
  { key: "kopfsalat", name: "Kopfsalat", kind: "salat", names: ["Kopfsalat", "grüner Salat", "Blattsalat", "Lollo Rosso", "Lollo Bianco", "Eichblattsalat", "Romanasalat", "Romana", "Salatherz", "Salatherzen"], fresh: [5, 6, 7, 8, 9, 10] },
  { key: "eisbergsalat", name: "Eisbergsalat", kind: "salat", names: ["Eisbergsalat", "Eissalat"], fresh: [6, 7, 8, 9, 10] },
  { key: "rucola", name: "Rucola", kind: "salat", names: ["Rucola", "Rauke"], fresh: [5, 6, 7, 8, 9, 10] },
  { key: "radicchio", name: "Radicchio", kind: "salat", names: ["Radicchio"], fresh: [7, 8, 9, 10, 11] },
  { key: "endivie", name: "Endivie", kind: "salat", names: ["Endivie", "Endiviensalat", "Frisée"], fresh: [8, 9, 10, 11] },
  { key: "chicoree", name: "Chicorée", kind: "salat", names: ["Chicorée", "Chicoree"], fresh: [10, 11, 12, 1, 2, 3, 4] },

  // Obst
  { key: "aepfel", name: "Äpfel", kind: "obst", names: ["Apfel", "Äpfel"], unlike: ["Granatapfel", "Granatäpfel", "Apfelsaft", "Apfelmus", "Apfelessig"], fresh: [8, 9, 10, 11], stored: [12, 1, 2, 3, 4, 5, 6, 7] },
  { key: "aprikosen", name: "Aprikosen", kind: "obst", names: ["Aprikose", "Aprikosen", "Marille", "Marillen"], unlike: ["getrocknete Aprikosen", "Aprikosenkonfitüre", "Aprikosenmarmelade"], fresh: [7, 8] },
  { key: "birnen", name: "Birnen", kind: "obst", names: ["Birne", "Birnen"], fresh: [8, 9, 10], stored: [11, 12, 1, 2] },
  { key: "brombeeren", name: "Brombeeren", kind: "obst", names: ["Brombeere", "Brombeeren"], fresh: [7, 8, 9] },
  { key: "erdbeeren", name: "Erdbeeren", kind: "obst", names: ["Erdbeere", "Erdbeeren"], fresh: [5, 6, 7] },
  { key: "heidelbeeren", name: "Heidelbeeren", kind: "obst", names: ["Heidelbeere", "Heidelbeeren", "Blaubeere", "Blaubeeren"], fresh: [7, 8, 9] },
  { key: "himbeeren", name: "Himbeeren", kind: "obst", names: ["Himbeere", "Himbeeren"], fresh: [6, 7, 8, 9] },
  { key: "johannisbeeren", name: "Johannisbeeren", kind: "obst", names: ["Johannisbeere", "Johannisbeeren", "Träuble", "Träubchen"], fresh: [6, 7, 8] },
  { key: "stachelbeeren", name: "Stachelbeeren", kind: "obst", names: ["Stachelbeere", "Stachelbeeren"], fresh: [6, 7, 8] },
  { key: "kirschen", name: "Kirschen", kind: "obst", names: ["Kirsche", "Kirschen", "Süßkirschen", "Sauerkirschen", "Schattenmorellen"], fresh: [6, 7, 8] },
  { key: "mirabellen", name: "Mirabellen", kind: "obst", names: ["Mirabelle", "Mirabellen"], fresh: [8, 9] },
  { key: "pflaumen", name: "Zwetschgen", kind: "obst", names: ["Zwetschge", "Zwetschgen", "Zwetschke", "Pflaume", "Pflaumen"], unlike: ["Trockenpflaumen", "Backpflaumen", "Pflaumenmus"], fresh: [7, 8, 9, 10] },
  { key: "pfirsiche", name: "Pfirsiche", kind: "obst", names: ["Pfirsich", "Pfirsiche", "Nektarine", "Nektarinen", "Weinbergpfirsich"], unlike: ["Pfirsichhälften"], fresh: [7, 8, 9] },
  { key: "quitten", name: "Quitten", kind: "obst", names: ["Quitte", "Quitten"], fresh: [9, 10, 11] },
  { key: "trauben", name: "Weintrauben", kind: "obst", names: ["Weintraube", "Weintrauben", "Trauben", "Tafeltrauben"], fresh: [9, 10] },
  { key: "holunder", name: "Holunderblüten", kind: "obst", names: ["Holunderblüten", "Holunderblütendolden"], fresh: [5, 6] },

  // Kräuter: in half the recipes, so a herb says little about a dish, wild garlic excepted.
  { key: "baerlauch", name: "Bärlauch", kind: "kraeuter", names: ["Bärlauch"], fresh: [3, 4], weight: 3 },
  { key: "basilikum", name: "Basilikum", kind: "kraeuter", names: ["Basilikum", "Basilikumblätter"], fresh: [6, 7, 8, 9] },
  { key: "dill", name: "Dill", kind: "kraeuter", names: ["Dill"], unlike: ["Dillspitzen getrocknet"], fresh: [6, 7, 8, 9] },
  { key: "petersilie", name: "Petersilie", kind: "kraeuter", names: ["Petersilie"], unlike: ["Petersilienwurzel"], fresh: [5, 6, 7, 8, 9, 10] },
  { key: "schnittlauch", name: "Schnittlauch", kind: "kraeuter", names: ["Schnittlauch", "Schnittlauchröllchen"], fresh: [4, 5, 6, 7, 8, 9, 10] },
  { key: "minze", name: "Minze", kind: "kraeuter", names: ["Minze", "Pfefferminze"], fresh: [6, 7, 8, 9] },
  { key: "kresse", name: "Kresse", kind: "kraeuter", names: ["Kresse", "Gartenkresse", "Brunnenkresse"], fresh: [3, 4, 5, 6, 7, 8, 9, 10] },

  // Pilze. Champignons are grown all year round and say nothing about the season.
  { key: "pfifferlinge", name: "Pfifferlinge", kind: "pilze", names: ["Pfifferling", "Pfifferlinge", "Eierschwammerl"], fresh: [7, 8, 9, 10] },
  { key: "steinpilze", name: "Steinpilze", kind: "pilze", names: ["Steinpilz", "Steinpilze"], unlike: ["getrocknete Steinpilze"], fresh: [8, 9, 10] },
  { key: "waldpilze", name: "Waldpilze", kind: "pilze", names: ["Waldpilze", "Waldpilzmischung", "Maronenröhrlinge"], fresh: [8, 9, 10, 11] },
];

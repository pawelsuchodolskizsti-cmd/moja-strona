// 30 przykładowych pytań terenowych — zastąp własnymi!
// Odpowiedzi są sprawdzane case-insensitive i po trimie.
// Możesz dodać wiele poprawnych odpowiedzi (aliases).

const QUESTIONS = [
  { id: 1,  text: "Jak nazywa się najwyższy szczyt Polski?",           answers: ["rysy"] },
  { id: 2,  text: "W którym roku Polska odzyskała niepodległość?",     answers: ["1918"] },
  { id: 3,  text: "Ile pięter ma Pałac Kultury i Nauki w Warszawie?", answers: ["42", "czterdzieści dwa"] },
  { id: 4,  text: "Jak nazywa się stolica Małopolski?",                answers: ["kraków", "krakow"] },
  { id: 5,  text: "Ile województw liczy Polska?",                      answers: ["16", "szesnaście"] },
  { id: 6,  text: "Jaka rzeka przepływa przez centrum Warszawy?",      answers: ["wisła", "wisla"] },
  { id: 7,  text: "Kto napisał 'Pan Tadeusz'?",                        answers: ["adam mickiewicz", "mickiewicz"] },
  { id: 8,  text: "Jak brzmi pierwsze słowo hymnu Polski?",            answers: ["jeszcze"] },
  { id: 9,  text: "Ile strun ma standardowa gitara klasyczna?",        answers: ["6", "sześć"] },
  { id: 10, text: "Jakie jest chemiczne oznaczenie wody?",             answers: ["h2o"] },
  { id: 11, text: "Kto namalował 'Monę Lisę'?",                        answers: ["leonardo da vinci", "da vinci", "leonardo"] },
  { id: 12, text: "Ile godzin liczy doba?",                            answers: ["24", "dwadzieścia cztery"] },
  { id: 13, text: "Jaki jest skrót od 'kilogram'?",                    answers: ["kg"] },
  { id: 14, text: "Jak nazywa się największy ocean świata?",           answers: ["spokojny", "pacyfik", "ocean spokojny"] },
  { id: 15, text: "Ile dni ma rok przestępny?",                        answers: ["366", "trzysta sześćdziesiąt sześć"] },
  { id: 16, text: "Z ilu kwadratów składa się standardowa szachownica?", answers: ["64", "sześćdziesiąt cztery"] },
  { id: 17, text: "Jakie jest twarde skupienie wody?",                 answers: ["lód"] },
  { id: 18, text: "Który pierwiastek ma symbol 'O'?",                  answers: ["tlen"] },
  { id: 19, text: "Jak nazywa się niewidzialna linia dzieląca Ziemię na półkule?", answers: ["równik"] },
  { id: 20, text: "Ile boków ma sześciokąt?",                          answers: ["6", "sześć"] },
  { id: 21, text: "Jakie miasto jest stolicą Francji?",                answers: ["paryż", "paryz", "paris"] },
  { id: 22, text: "Kto był pierwszym człowiekiem w kosmosie?",         answers: ["jurij gagarin", "gagarin", "yuri gagarin"] },
  { id: 23, text: "Ile wynosi pierwiastek kwadratowy z 144?",          answers: ["12", "dwanaście"] },
  { id: 24, text: "Jak nazywa się najdłuższa rzeka świata?",           answers: ["nil"] },
  { id: 25, text: "Ile sekund ma minuta?",                             answers: ["60", "sześćdziesiąt"] },
  { id: 26, text: "Jakie zwierzę jest symbolem WWF?",                  answers: ["panda", "wielka panda"] },
  { id: 27, text: "W jakim kraju leżą Alpy?",                          answers: ["szwajcaria", "austria", "francja", "włochy", "niemcy", "słowenia"] },
  { id: 28, text: "Ile liter liczy polski alfabet?",                   answers: ["32"] },
  { id: 29, text: "Jak nazywa się gaz tworzący 78% atmosfery Ziemi?",  answers: ["azot"] },
  { id: 30, text: "Kto wynalazł żarówkę?",                             answers: ["thomas edison", "edison"] },
];

module.exports = { QUESTIONS };

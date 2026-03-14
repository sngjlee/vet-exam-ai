export type Question = {
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  category: string;
};

const mockQuestions: Question[] = [
  {
    question: "Which hormone triggers ovulation in mammals?",
    choices: ["FSH", "LH", "Progesterone", "Estrogen", "Prolactin"],
    answer: "LH",
    explanation: "Luteinising hormone surge is the key trigger for ovulation.",
    category: "Reproduction",
  },
  {
    question: "Where does fertilisation usually occur in mammals?",
    choices: [
      "Uterine body",
      "Cervix",
      "Oviduct ampulla",
      "Vagina",
      "Ovary",
    ],
    answer: "Oviduct ampulla",
    explanation: "Fertilisation generally occurs in the ampullary region of the oviduct.",
    category: "Reproduction",
  },
  {
    question: "Which cell type surrounds the mammalian oocyte directly?",
    choices: [
      "Theca cells",
      "Luteal cells",
      "Granulosa cells",
      "Cumulus cells",
      "Stromal cells",
    ],
    answer: "Cumulus cells",
    explanation: "Cumulus cells closely surround the oocyte and form the cumulus-oocyte complex.",
    category: "Reproduction",
  },
  {
    question: "Which structure connects the ovary to the uterus?",
    choices: [
      "Cervix",
      "Oviduct",
      "Vagina",
      "Endometrium",
      "Myometrium",
    ],
    answer: "Oviduct",
    explanation: "The oviduct transports the oocyte and connects the ovary region with the uterus.",
    category: "Anatomy",
  },
  {
    question: "Which hormone is primarily produced by the corpus luteum?",
    choices: ["LH", "FSH", "Progesterone", "Oxytocin", "Prolactin"],
    answer: "Progesterone",
    explanation: "The corpus luteum primarily secretes progesterone after ovulation.",
    category: "Endocrinology",
  },
];

export async function generateQuestion(): Promise<Question> {
  const randomIndex = Math.floor(Math.random() * mockQuestions.length);
  return mockQuestions[randomIndex];
}
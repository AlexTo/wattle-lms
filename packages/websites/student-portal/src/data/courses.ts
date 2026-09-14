/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CourseLesson {
  lessonId: string;
  title: string;
  duration: string;
}

export interface CourseModule {
  moduleId: string;
  title: string;
  lessons: CourseLesson[];
}

export interface CourseSummary {
  code: string;
  title: string;
  description: string;
  duration: string;
  level: string;
  category: string;
  icon: string;
  surface: string;
  modules: CourseModule[];
}

export const categories = [
  'All',
  'Science',
  'Technology',
  'Mathematics',
  'Communication',
  'Business',
] as const;

export const courses: CourseSummary[] = [
  {
    code: 'BIO102',
    title: 'Foundations of Biology',
    description:
      'Explore cells, genetics, ecosystems, and the living systems that shape our world.',
    duration: '8 weeks',
    level: 'Beginner',
    category: 'Science',
    icon: '🧬',
    surface: 'from-emerald-500/20 to-teal-500/5',
    modules: [
      {
        moduleId: 'bio102-m1',
        title: 'Cell Biology Basics',
        lessons: [
          {
            lessonId: 'bio102-m1-l1',
            title: 'What Is a Cell?',
            duration: '12 min',
          },
          {
            lessonId: 'bio102-m1-l2',
            title: 'Cell Structure and Organelles',
            duration: '18 min',
          },
          {
            lessonId: 'bio102-m1-l3',
            title: 'Cell Division and Reproduction',
            duration: '15 min',
          },
        ],
      },
      {
        moduleId: 'bio102-m2',
        title: 'Genetics and Heredity',
        lessons: [
          {
            lessonId: 'bio102-m2-l1',
            title: 'DNA and the Genetic Code',
            duration: '16 min',
          },
          {
            lessonId: 'bio102-m2-l2',
            title: 'Mendelian Inheritance',
            duration: '14 min',
          },
          {
            lessonId: 'bio102-m2-l3',
            title: 'Genetic Variation and Mutation',
            duration: '13 min',
          },
        ],
      },
      {
        moduleId: 'bio102-m3',
        title: 'Ecosystems and Life',
        lessons: [
          {
            lessonId: 'bio102-m3-l1',
            title: 'Energy Flow in Ecosystems',
            duration: '15 min',
          },
          {
            lessonId: 'bio102-m3-l2',
            title: 'Populations and Communities',
            duration: '17 min',
          },
          {
            lessonId: 'bio102-m3-l3',
            title: 'Human Impact on Ecosystems',
            duration: '19 min',
          },
        ],
      },
    ],
  },
  {
    code: 'MTH201',
    title: 'Applied Mathematics',
    description:
      'Build practical problem-solving skills through real-world mathematical models.',
    duration: '10 weeks',
    level: 'Intermediate',
    category: 'Mathematics',
    icon: '∑',
    surface: 'from-blue-500/20 to-indigo-500/5',
    modules: [
      {
        moduleId: 'mth201-m1',
        title: 'Mathematical Modelling Foundations',
        lessons: [
          {
            lessonId: 'mth201-m1-l1',
            title: 'From Real Problems to Equations',
            duration: '14 min',
          },
          {
            lessonId: 'mth201-m1-l2',
            title: 'Linear and Nonlinear Models',
            duration: '18 min',
          },
          {
            lessonId: 'mth201-m1-l3',
            title: 'Working with Functions and Graphs',
            duration: '16 min',
          },
        ],
      },
      {
        moduleId: 'mth201-m2',
        title: 'Optimisation and Change',
        lessons: [
          {
            lessonId: 'mth201-m2-l1',
            title: 'Rates of Change and Derivatives',
            duration: '20 min',
          },
          {
            lessonId: 'mth201-m2-l2',
            title: 'Finding Optimal Solutions',
            duration: '17 min',
          },
          {
            lessonId: 'mth201-m2-l3',
            title: 'Modelling Growth and Decay',
            duration: '15 min',
          },
        ],
      },
      {
        moduleId: 'mth201-m3',
        title: 'Data-Driven Problem Solving',
        lessons: [
          {
            lessonId: 'mth201-m3-l1',
            title: 'Probability in Practice',
            duration: '16 min',
          },
          {
            lessonId: 'mth201-m3-l2',
            title: 'Statistical Reasoning',
            duration: '18 min',
          },
          {
            lessonId: 'mth201-m3-l3',
            title: 'Capstone: Solve a Real-World Model',
            duration: '25 min',
          },
        ],
      },
    ],
  },
  {
    code: 'DAT110',
    title: 'Data Literacy',
    description:
      'Learn to interpret, question, and communicate with data confidently.',
    duration: '6 weeks',
    level: 'Beginner',
    category: 'Technology',
    icon: '⌁',
    surface: 'from-violet-500/20 to-fuchsia-500/5',
    modules: [
      {
        moduleId: 'dat110-m1',
        title: 'Thinking with Data',
        lessons: [
          {
            lessonId: 'dat110-m1-l1',
            title: 'What Makes Data Trustworthy?',
            duration: '12 min',
          },
          {
            lessonId: 'dat110-m1-l2',
            title: 'Reading Charts and Tables Critically',
            duration: '15 min',
          },
          {
            lessonId: 'dat110-m1-l3',
            title: 'Common Data Traps and Biases',
            duration: '14 min',
          },
        ],
      },
      {
        moduleId: 'dat110-m2',
        title: 'Working with Data',
        lessons: [
          {
            lessonId: 'dat110-m2-l1',
            title: 'Collecting and Cleaning Data',
            duration: '17 min',
          },
          {
            lessonId: 'dat110-m2-l2',
            title: 'Summarising Data Clearly',
            duration: '13 min',
          },
          {
            lessonId: 'dat110-m2-l3',
            title: 'Spreadsheets for Everyday Analysis',
            duration: '19 min',
          },
        ],
      },
      {
        moduleId: 'dat110-m3',
        title: 'Communicating with Data',
        lessons: [
          {
            lessonId: 'dat110-m3-l1',
            title: 'Choosing the Right Visualisation',
            duration: '16 min',
          },
          {
            lessonId: 'dat110-m3-l2',
            title: 'Telling a Story with Data',
            duration: '15 min',
          },
          {
            lessonId: 'dat110-m3-l3',
            title: 'Presenting Findings to an Audience',
            duration: '18 min',
          },
        ],
      },
    ],
  },
  {
    code: 'COM105',
    title: 'Academic Communication',
    description:
      'Write clearly, research effectively, and present your ideas with confidence.',
    duration: '6 weeks',
    level: 'Beginner',
    category: 'Communication',
    icon: '✎',
    surface: 'from-amber-500/20 to-orange-500/5',
    modules: [
      {
        moduleId: 'com105-m1',
        title: 'Foundations of Clear Writing',
        lessons: [
          {
            lessonId: 'com105-m1-l1',
            title: 'Structuring an Argument',
            duration: '13 min',
          },
          {
            lessonId: 'com105-m1-l2',
            title: 'Paragraphs with Purpose',
            duration: '12 min',
          },
          {
            lessonId: 'com105-m1-l3',
            title: 'Editing for Clarity',
            duration: '15 min',
          },
        ],
      },
      {
        moduleId: 'com105-m2',
        title: 'Research and Evidence',
        lessons: [
          {
            lessonId: 'com105-m2-l1',
            title: 'Finding Credible Sources',
            duration: '14 min',
          },
          {
            lessonId: 'com105-m2-l2',
            title: 'Note-Taking and Paraphrasing',
            duration: '16 min',
          },
          {
            lessonId: 'com105-m2-l3',
            title: 'Referencing and Avoiding Plagiarism',
            duration: '15 min',
          },
        ],
      },
      {
        moduleId: 'com105-m3',
        title: 'Presenting Your Ideas',
        lessons: [
          {
            lessonId: 'com105-m3-l1',
            title: 'Planning a Presentation',
            duration: '14 min',
          },
          {
            lessonId: 'com105-m3-l2',
            title: 'Speaking with Confidence',
            duration: '17 min',
          },
          {
            lessonId: 'com105-m3-l3',
            title: 'Handling Questions and Discussion',
            duration: '13 min',
          },
        ],
      },
    ],
  },
  {
    code: 'PSY101',
    title: 'Introduction to Psychology',
    description:
      'Understand human behaviour through cognition, development, and social psychology.',
    duration: '8 weeks',
    level: 'Beginner',
    category: 'Science',
    icon: '◉',
    surface: 'from-rose-500/20 to-pink-500/5',
    modules: [
      {
        moduleId: 'psy101-m1',
        title: 'How the Mind Works',
        lessons: [
          {
            lessonId: 'psy101-m1-l1',
            title: 'Perception and Attention',
            duration: '15 min',
          },
          {
            lessonId: 'psy101-m1-l2',
            title: 'Memory and Learning',
            duration: '17 min',
          },
          {
            lessonId: 'psy101-m1-l3',
            title: 'Thinking and Problem-Solving',
            duration: '16 min',
          },
        ],
      },
      {
        moduleId: 'psy101-m2',
        title: 'Development Across Life',
        lessons: [
          {
            lessonId: 'psy101-m2-l1',
            title: 'Infancy and Early Childhood',
            duration: '14 min',
          },
          {
            lessonId: 'psy101-m2-l2',
            title: 'Adolescence and Identity',
            duration: '15 min',
          },
          {
            lessonId: 'psy101-m2-l3',
            title: 'Adulthood and Ageing',
            duration: '13 min',
          },
        ],
      },
      {
        moduleId: 'psy101-m3',
        title: 'Psychology and Society',
        lessons: [
          {
            lessonId: 'psy101-m3-l1',
            title: 'Social Influence and Groups',
            duration: '16 min',
          },
          {
            lessonId: 'psy101-m3-l2',
            title: 'Emotion and Motivation',
            duration: '14 min',
          },
          {
            lessonId: 'psy101-m3-l3',
            title: 'Introduction to Mental Wellbeing',
            duration: '18 min',
          },
        ],
      },
    ],
  },
  {
    code: 'BUS120',
    title: 'Business Essentials',
    description:
      'Discover the core ideas behind teams, markets, strategy, and sustainable growth.',
    duration: '7 weeks',
    level: 'Beginner',
    category: 'Business',
    icon: '↗',
    surface: 'from-cyan-500/20 to-sky-500/5',
    modules: [
      {
        moduleId: 'bus120-m1',
        title: 'Foundations of Business',
        lessons: [
          {
            lessonId: 'bus120-m1-l1',
            title: 'What Makes a Business Work?',
            duration: '13 min',
          },
          {
            lessonId: 'bus120-m1-l2',
            title: 'Understanding Markets and Customers',
            duration: '16 min',
          },
          {
            lessonId: 'bus120-m1-l3',
            title: 'Business Structures and Ownership',
            duration: '14 min',
          },
        ],
      },
      {
        moduleId: 'bus120-m2',
        title: 'Strategy and Operations',
        lessons: [
          {
            lessonId: 'bus120-m2-l1',
            title: 'Setting Goals and Strategy',
            duration: '15 min',
          },
          {
            lessonId: 'bus120-m2-l2',
            title: 'Managing People and Teams',
            duration: '17 min',
          },
          {
            lessonId: 'bus120-m2-l3',
            title: 'Operations and Value Chains',
            duration: '16 min',
          },
        ],
      },
      {
        moduleId: 'bus120-m3',
        title: 'Growth and Sustainability',
        lessons: [
          {
            lessonId: 'bus120-m3-l1',
            title: 'Financial Basics for Managers',
            duration: '18 min',
          },
          {
            lessonId: 'bus120-m3-l2',
            title: 'Marketing Fundamentals',
            duration: '15 min',
          },
          {
            lessonId: 'bus120-m3-l3',
            title: 'Building a Sustainable Business',
            duration: '17 min',
          },
        ],
      },
    ],
  },
  {
    code: 'DAT210',
    title: 'Data Literacy for Decision Making',
    description:
      'Turn data into confident decisions, from spotting patterns to weighing trade-offs and risk.',
    duration: '4 weeks',
    level: 'Beginner',
    category: 'Technology',
    icon: '📊',
    surface: 'from-blue-500/20 to-cyan-500/5',
    modules: [
      {
        moduleId: 'dat210-m1',
        title: 'Foundations of Data-Informed Decisions',
        lessons: [
          {
            lessonId: 'dat210-m1-l1',
            title: 'Why Decisions Need Evidence',
            duration: '12 min',
          },
          {
            lessonId: 'dat210-m1-l2',
            title: 'Types of Business Data',
            duration: '14 min',
          },
          {
            lessonId: 'dat210-m1-l3',
            title: 'Common Decision-Making Pitfalls',
            duration: '13 min',
          },
        ],
      },
      {
        moduleId: 'dat210-m2',
        title: 'Turning Data into Insight',
        lessons: [
          {
            lessonId: 'dat210-m2-l1',
            title: 'Spotting Patterns and Trends',
            duration: '15 min',
          },
          {
            lessonId: 'dat210-m2-l2',
            title: 'Comparing Options with Data',
            duration: '16 min',
          },
          {
            lessonId: 'dat210-m2-l3',
            title: 'Communicating Trade-offs',
            duration: '14 min',
          },
        ],
      },
      {
        moduleId: 'dat210-m3',
        title: 'Making the Call',
        lessons: [
          {
            lessonId: 'dat210-m3-l1',
            title: 'Building a Simple Decision Framework',
            duration: '16 min',
          },
          {
            lessonId: 'dat210-m3-l2',
            title: 'Weighing Risk and Uncertainty',
            duration: '15 min',
          },
          {
            lessonId: 'dat210-m3-l3',
            title: 'Case Study: A Real Decision',
            duration: '20 min',
          },
        ],
      },
    ],
  },
  {
    code: 'BUS220',
    title: 'Project Management Essentials',
    description:
      'Plan, run, and close out projects with confidence using practical, widely-used PM fundamentals.',
    duration: '6 weeks',
    level: 'Beginner',
    category: 'Business',
    icon: '🗂',
    surface: 'from-violet-500/20 to-fuchsia-500/5',
    modules: [
      {
        moduleId: 'bus220-m1',
        title: 'Starting a Project Right',
        lessons: [
          {
            lessonId: 'bus220-m1-l1',
            title: 'Defining Scope and Objectives',
            duration: '13 min',
          },
          {
            lessonId: 'bus220-m1-l2',
            title: 'Identifying Stakeholders',
            duration: '12 min',
          },
          {
            lessonId: 'bus220-m1-l3',
            title: 'Planning at a High Level',
            duration: '15 min',
          },
        ],
      },
      {
        moduleId: 'bus220-m2',
        title: 'Keeping Projects on Track',
        lessons: [
          {
            lessonId: 'bus220-m2-l1',
            title: 'Scheduling and Milestones',
            duration: '17 min',
          },
          {
            lessonId: 'bus220-m2-l2',
            title: 'Managing Risks and Issues',
            duration: '16 min',
          },
          {
            lessonId: 'bus220-m2-l3',
            title: 'Tracking Progress and Budget',
            duration: '14 min',
          },
        ],
      },
      {
        moduleId: 'bus220-m3',
        title: 'Delivering and Closing Out',
        lessons: [
          {
            lessonId: 'bus220-m3-l1',
            title: 'Communicating Status Updates',
            duration: '13 min',
          },
          {
            lessonId: 'bus220-m3-l2',
            title: 'Handling Change Requests',
            duration: '14 min',
          },
          {
            lessonId: 'bus220-m3-l3',
            title: 'Closing a Project Well',
            duration: '15 min',
          },
        ],
      },
    ],
  },
  {
    code: 'PDV150',
    title: 'Presenting Data with Confidence',
    description:
      'Turn a spreadsheet into a story: choose the right visuals and present findings with clarity and impact.',
    duration: '3 weeks',
    level: 'Intermediate',
    category: 'Communication',
    icon: '🎤',
    surface: 'from-amber-500/20 to-orange-500/5',
    modules: [
      {
        moduleId: 'pdv150-m1',
        title: 'Preparing Your Story',
        lessons: [
          {
            lessonId: 'pdv150-m1-l1',
            title: 'Know Your Audience',
            duration: '11 min',
          },
          {
            lessonId: 'pdv150-m1-l2',
            title: 'Choosing the Right Data to Show',
            duration: '13 min',
          },
          {
            lessonId: 'pdv150-m1-l3',
            title: 'Structuring a Data Narrative',
            duration: '14 min',
          },
        ],
      },
      {
        moduleId: 'pdv150-m2',
        title: 'Designing Clear Visuals',
        lessons: [
          {
            lessonId: 'pdv150-m2-l1',
            title: 'Picking the Right Chart',
            duration: '15 min',
          },
          {
            lessonId: 'pdv150-m2-l2',
            title: 'Avoiding Common Chart Mistakes',
            duration: '13 min',
          },
          {
            lessonId: 'pdv150-m2-l3',
            title: 'Slide Design Basics',
            duration: '12 min',
          },
        ],
      },
      {
        moduleId: 'pdv150-m3',
        title: 'Presenting with Impact',
        lessons: [
          {
            lessonId: 'pdv150-m3-l1',
            title: 'Speaking to a Chart',
            duration: '14 min',
          },
          {
            lessonId: 'pdv150-m3-l2',
            title: 'Handling Tough Questions',
            duration: '12 min',
          },
          {
            lessonId: 'pdv150-m3-l3',
            title: 'Practice and Feedback',
            duration: '18 min',
          },
        ],
      },
    ],
  },
];

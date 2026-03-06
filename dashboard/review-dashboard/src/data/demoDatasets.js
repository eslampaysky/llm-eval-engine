export const DEMO_DATASETS = [
  {
    id: 'customer_support',
    fileName: 'customer_support.json',
    title: 'Customer Support QA',
    description: 'Support chatbot answers',
    samples: [
      {
        question: 'I was charged twice for order #A1029. Can you refund the duplicate charge?',
        ground_truth: 'Yes, we can refund duplicate charges after verification. Please share the order ID and transaction IDs; refunds typically appear in 5-10 business days.',
        model_answer: 'We can help with that. Please share order #A1029 and both transaction references so we can verify and issue a duplicate-charge refund. Once approved, the refund usually posts within 5-10 business days.',
        context: 'Support policy: duplicate charges are refundable after payment verification.',
      },
      {
        question: 'How do I reset my account password?',
        ground_truth: "Use the 'Forgot password' link on the login page, verify your email, then create a new password.",
        model_answer: "Go to the login page, click 'Forgot password', confirm via email, and set a new password.",
        context: 'Account recovery flow requires email verification.',
      },
      {
        question: 'Can I cancel my shipment after it has already shipped?',
        ground_truth: 'Once shipped, cancellation is not guaranteed; you can refuse delivery or request a return after arrival.',
        model_answer: 'Yes, you can always cancel any shipment instantly, even after delivery, and get a full refund with no conditions.',
        context: 'Shipping policy: cancellations after dispatch are limited and may require returns.',
      },
      {
        question: 'Do you offer weekend support hours?',
        ground_truth: 'Yes, weekend live chat is available from 10:00 to 16:00 UTC.',
        model_answer: 'Weekend support is available via live chat from 10:00 to 16:00 UTC.',
        context: 'Support schedule: weekdays full hours, weekends reduced hours.',
      },
      {
        question: "My package says delivered but I didn't receive it. What should I do?",
        ground_truth: 'Check with neighbors/building desk, wait up to 24 hours, then contact support to open a carrier investigation.',
        model_answer: 'Please check nearby locations or with neighbors, wait up to 24 hours for delayed scans, then contact us and we will open a carrier investigation.',
        context: 'Lost-package workflow starts after short wait and local check.',
      },
    ],
  },
  {
    id: 'rag_qa',
    fileName: 'rag_qa.json',
    title: 'RAG Knowledge QA',
    description: 'Retrieval-based answers',
    samples: [
      {
        question: 'According to the policy excerpt, what is the premium plan data retention period?',
        ground_truth: '180 days.',
        model_answer: 'The premium plan retains logs for 180 days.',
        context: 'Policy excerpt: Free plan retention is 30 days. Premium retention is 180 days. Enterprise retention is configurable.',
      },
      {
        question: 'What ports are required for the service based on the deployment note?',
        ground_truth: 'HTTPS on 443 and health checks on 8080.',
        model_answer: 'You only need port 80 because HTTPS is optional.',
        context: 'Deployment note: External traffic must use HTTPS on 443. Internal health checks run on 8080.',
      },
      {
        question: 'From the incident report, what was the root cause?',
        ground_truth: 'An expired TLS certificate on the API gateway.',
        model_answer: 'The incident was caused by an expired TLS certificate on the gateway.',
        context: 'Incident report summary: 42-minute outage. Root cause: expired TLS certificate on API gateway. Action: automate cert renewal alerts.',
      },
      {
        question: 'What is the documented maximum batch size for bulk import?',
        ground_truth: '500 records per request.',
        model_answer: 'The docs specify a 500-record maximum batch size per request.',
        context: 'API docs: Bulk import accepts up to 500 records/request; larger payloads return 413.',
      },
      {
        question: 'Which authentication methods are listed in the security note?',
        ground_truth: 'API keys and OAuth 2.0 client credentials.',
        model_answer: 'Authentication supports API keys and OAuth 2.0 client credentials.',
        context: 'Security note: Supported methods include API key auth and OAuth 2.0 client credentials flow.',
      },
    ],
  },
  {
    id: 'factual_questions',
    fileName: 'factual_questions.json',
    title: 'Factual QA',
    description: 'General knowledge',
    samples: [
      {
        question: 'What is the capital city of Japan?',
        ground_truth: 'Tokyo.',
        model_answer: 'Tokyo is the capital of Japan.',
      },
      {
        question: 'Which planet is known as the Red Planet?',
        ground_truth: 'Mars.',
        model_answer: 'Mars is known as the Red Planet.',
      },
      {
        question: "Who wrote the play 'Hamlet'?",
        ground_truth: 'William Shakespeare.',
        model_answer: 'Hamlet was written by William Shakespeare.',
      },
      {
        question: 'What is the boiling point of water at sea level in Celsius?',
        ground_truth: '100 degrees Celsius.',
        model_answer: 'Water boils at 90 degrees Celsius at sea level.',
      },
      {
        question: 'What is the largest ocean on Earth?',
        ground_truth: 'The Pacific Ocean.',
        model_answer: 'The Pacific Ocean is the largest ocean on Earth.',
      },
    ],
  },
];


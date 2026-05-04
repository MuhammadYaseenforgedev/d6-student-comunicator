type LegalSection = {
  heading: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
};

export const LEGAL_CONTENT: {
  title: string;
  lastUpdated: string;
  sections: readonly LegalSection[];
} = {
  title: "Forge Communicator: Terms of Use & POPIA Disclosure",
  lastUpdated: "March 30, 2026",
  sections: [
    {
      heading: "1. Acceptance of Terms",
      paragraphs: [
        'By clicking "I Accept" or by accessing and using the Forge Communicator platform (the "System"), you agree to be bound by these Terms of Use and the associated Privacy Policy. If you do not agree to these terms, you may not access or use the System.',
      ],
    },
    {
      heading: "2. POPIA Privacy Notice & Consent",
      paragraphs: [
        "In accordance with the Protection of Personal Information Act (POPIA), we hereby notify you of the following:",
      ],
      items: [
        "Data Collection: We collect personal information including, but not limited to, your name, employee/student ID, email address, and IP address.",
        "Purpose: This data is collected solely for user authentication, secure communication, and system administration within the Forge ecosystem.",
        "Data Security: We implement industry-standard technical and organizational measures to secure your data against unauthorized access, loss, or destruction.",
        "Third Parties: Your personal information will not be sold or shared with external third parties for marketing purposes.",
        "Your Rights: You have the right to access your personal data, request its correction, or object to its processing by contacting the System Administrator.",
      ],
    },
    {
      heading: "3. IT & Acceptable Use Disclaimer",
      items: [
        "System Ownership: Forge Communicator is the property of the organization. All communications transmitted via this System may be monitored or logged for security and compliance purposes.",
        'No Warranty: The System is provided on an "as-is" and "as-available" basis. The IT team and developers do not warrant that the System will be uninterrupted, error-free, or free of viruses.',
        "Limitation of Liability: To the maximum extent permitted by law, the developers and the organization shall not be liable for any loss of data, loss of profits, or any indirect or consequential damages arising from the use of the System.",
        "User Responsibility: You are responsible for maintaining the confidentiality of your login credentials. Any activity occurring under your account is your responsibility.",
      ],
    },
    {
      heading: "4. Prohibited Conduct",
      paragraphs: ["Users are strictly prohibited from:"],
      items: [
        "Using the System to transmit defamatory, harassing, or illegal material.",
        "Attempting to bypass security protocols or gain unauthorized access to other user accounts.",
        "Sharing sensitive organizational data with unauthorized external parties.",
      ],
    },
  ],
} as const;

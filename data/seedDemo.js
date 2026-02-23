import bcrypt from "bcryptjs";
import dotenv from "dotenv";

import { connectDB } from "../config/db.js";
import Application from "../models/Application.js";
import Scholarship from "../models/Scholarship.js";
import User from "../models/User.js";
import UserProfile from "../models/UserProfile.js";
import {
  buildChecklistFromScholarship,
  buildDefaultRoadmap,
  calculateProgress
} from "../utils/applicationProgress.js";

dotenv.config();

async function upsertUser({ name, email, role, password, createdBy }) {
  const hash = await bcrypt.hash(password, 10);
  return User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { name, email: email.toLowerCase(), role, password: hash, createdBy: createdBy || null },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function run() {
  await connectDB();

  const admin = await upsertUser({
    name: "Admin Demo",
    email: "admin@scholarlink.demo",
    role: "ADMIN",
    password: "Pass@1234"
  });

  const moderator = await upsertUser({
    name: "Moderator Demo",
    email: "moderator@scholarlink.demo",
    role: "MODERATOR",
    password: "Pass@1234",
    createdBy: admin._id
  });

  const student = await upsertUser({
    name: "Asha Student",
    email: "student@scholarlink.demo",
    role: "STUDENT",
    password: "Pass@1234"
  });

  await UserProfile.findOneAndUpdate(
    { userId: student._id },
    {
      userId: student._id,
      gender: "FEMALE",
      mobile: "9123456789",
      dateOfBirth: new Date("2005-07-01"),
      address: {
        state: "Maharashtra",
        district: "Pune",
        pincode: "411001",
        line1: "Hostel Road"
      },
      education: {
        educationLevel: "DIPLOMA",
        course: "Diploma in Computer Engineering",
        branch: "Computer",
        institute: "Government Polytechnic",
        currentYear: 2,
        percentage: 82
      },
      category: "OBC",
      annualIncome: 180000,
      financial: {
        hasDisability: false,
        isFirstGenerationLearner: true,
        guardianOccupation: "Daily wage worker"
      },
      preferredLanguages: ["en", "hi", "mr"],
      profileCompletion: 100
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const scholarshipSeed = [
    {
      title: "Maharashtra Diploma Merit Scholarship",
      description:
        "Support for high-performing diploma students from low-income families in Maharashtra.",
      provider: {
        name: "Dept. of Technical Education",
        type: "GOVERNMENT",
        website: "https://maharashtra.gov.in"
      },
      amount: 45000,
      benefits: "Tuition reimbursement and annual stipend",
      eligibility: {
        minMarks: 70,
        maxIncome: 300000,
        categories: ["OPEN", "OBC", "SC", "ST", "EWS", "SEBC", "VJNT"],
        gender: "ANY",
        statesAllowed: ["Maharashtra"],
        educationLevel: "DIPLOMA"
      },
      documentsRequired: ["AADHAAR", "INCOME_CERTIFICATE", "MARKSHEET", "DOMICILE"],
      commonMistakes: [
        "Income certificate expiry date not checked",
        "Name mismatch between Aadhaar and marksheet",
        "Applying after deadline day"
      ],
      applicationProcess: {
        mode: "ONLINE",
        applyLink: "https://scholarships.gov.in",
        steps: [
          "Fill profile details",
          "Upload documents",
          "Submit scholarship form on NSP",
          "Track status on portal"
        ]
      },
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "APPROVED",
      verificationStatus: "VERIFIED",
      isActive: true,
      createdBy: moderator._id,
      reviewedBy: admin._id,
      localizedContent: {
        en: {
          title: "Maharashtra Diploma Merit Scholarship",
          description:
            "Support for high-performing diploma students from low-income families in Maharashtra."
        },
        hi: {
          title: "महाराष्ट्र डिप्लोमा मेरिट छात्रवृत्ति",
          description: "महाराष्ट्र के आर्थिक रूप से कमजोर डिप्लोमा छात्रों के लिए सहायता।"
        },
        mr: {
          title: "महाराष्ट्र डिप्लोमा मेरिट शिष्यवृत्ती",
          description: "आर्थिकदृष्ट्या गरजू डिप्लोमा विद्यार्थ्यांसाठी शैक्षणिक मदत."
        }
      },
      tags: ["diploma", "low-income", "maharashtra"]
    },
    {
      title: "CSR STEM Girls Scholarship",
      description: "Private CSR scholarship for girls pursuing STEM diplomas/UG.",
      provider: {
        name: "TechForward Foundation",
        type: "CSR",
        website: "https://techforward.example.org"
      },
      amount: 60000,
      benefits: "Tuition support, mentorship, and laptop grant",
      eligibility: {
        minMarks: 65,
        maxIncome: 400000,
        categories: [],
        gender: "FEMALE",
        statesAllowed: ["Maharashtra", "Gujarat", "Karnataka"],
        educationLevel: "DIPLOMA"
      },
      documentsRequired: ["AADHAAR", "INCOME_CERTIFICATE", "MARKSHEET"],
      commonMistakes: [
        "Incorrect category selection in official form",
        "Skipping statement of purpose document"
      ],
      applicationProcess: {
        mode: "ONLINE",
        applyLink: "https://techforward.example.org/scholarship",
        steps: ["Create account", "Upload docs", "Submit statement of purpose"]
      },
      deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      status: "APPROVED",
      verificationStatus: "VERIFIED",
      isActive: true,
      createdBy: moderator._id,
      reviewedBy: admin._id,
      localizedContent: {
        en: {
          title: "CSR STEM Girls Scholarship",
          description: "Private CSR scholarship for girls pursuing STEM diplomas/UG."
        },
        hi: {
          title: "सीएसआर STEM गर्ल्स छात्रवृत्ति",
          description: "STEM में पढ़ने वाली छात्राओं के लिए CSR सहायता।"
        },
        mr: {
          title: "CSR STEM मुलींसाठी शिष्यवृत्ती",
          description: "STEM अभ्यासक्रमातील विद्यार्थिनींसाठी CSR शैक्षणिक मदत."
        }
      },
      tags: ["girls", "stem", "csr"]
    },
    {
      title: "Future Skills NGO Scholarship",
      description: "NGO-backed support for first-generation learners from rural regions.",
      provider: {
        name: "Future Skills Trust",
        type: "NGO",
        website: "https://futureskills.example.org"
      },
      amount: 30000,
      benefits: "Fee support and interview preparation",
      eligibility: {
        minMarks: 60,
        maxIncome: 250000,
        categories: ["SC", "ST", "OBC", "EWS", "SEBC"],
        gender: "ANY",
        statesAllowed: ["Maharashtra"],
        educationLevel: "DIPLOMA"
      },
      documentsRequired: ["AADHAAR", "INCOME_CERTIFICATE", "CASTE_CERTIFICATE", "MARKSHEET"],
      commonMistakes: [
        "Uploading blurred caste certificate scan",
        "Missing marksheet for latest semester"
      ],
      applicationProcess: {
        mode: "BOTH",
        applyLink: "https://futureskills.example.org/scholarship",
        steps: ["Register", "Upload proofs", "Attend telephonic verification"]
      },
      deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      status: "APPROVED",
      verificationStatus: "UNVERIFIED",
      isActive: true,
      createdBy: moderator._id
    }
  ];

  const scholarshipDocs = [];
  for (const item of scholarshipSeed) {
    const scholarship = await Scholarship.findOneAndUpdate({ title: item.title }, item, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    });
    scholarshipDocs.push(scholarship);
  }

  const primaryScholarship = scholarshipDocs[0];
  if (primaryScholarship) {
    const roadmapSteps = buildDefaultRoadmap();
    roadmapSteps[0].isDone = true;
    roadmapSteps[0].completedAt = new Date();

    const application = await Application.findOneAndUpdate(
      { studentId: student._id, scholarshipId: primaryScholarship._id },
      {
        studentId: student._id,
        scholarshipId: primaryScholarship._id,
        status: "IN_PROGRESS",
        roadmapSteps,
        documentChecklist: buildChecklistFromScholarship(primaryScholarship),
        deadlineSnapshot: primaryScholarship.deadline
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    application.progressPercent = calculateProgress(application);
    await application.save();
  }

  console.log("Demo seed complete.");
  console.log("Admin login: admin@scholarlink.demo / Pass@1234");
  console.log("Moderator login: moderator@scholarlink.demo / Pass@1234");
  console.log("Student login: student@scholarlink.demo / Pass@1234");
  process.exit(0);
}

run().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});

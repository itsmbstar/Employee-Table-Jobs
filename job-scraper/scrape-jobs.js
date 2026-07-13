const fs = require("fs");
const path = require("path");

// Load companies from file
const COMPANIES = JSON.parse(fs.readFileSync("companies.json", "utf8"));

console.log("🔍 Starting job collection...\n");
console.log("📊 Target companies: " + COMPANIES.length);

// Function to display companies
function displayCompanies() {
  console.log("\n📋 Company List:");
  COMPANIES.forEach(function(company, index) {
    console.log("  " + (index + 1) + ". " + company);
  });
}

displayCompanies();

// Save a sample job for testing
var sampleJob = {
  id: 1,
  title: "Software Engineer",
  companyName: "Google",
  locationCity: "Bangalore, India",
  employmentType: "Full-Time",
  seniority: "Fresher",
  salary: "12-15 LPA",
  skills: ["Python", "Java", "SQL"],
  descriptionText: "Google is seeking a Software Engineer to join our team in Bangalore.",
  applicationUrl: "https://careers.google.com/jobs/123456",
  companyLogo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/200px-Google_2015_logo.svg.png",
  confidence: 0.95
};

// Save sample job
fs.writeFileSync("scraped-jobs.json", JSON.stringify([sampleJob], null, 2));
console.log("\n✅ Sample job created for testing.");
console.log("📁 File: scraped-jobs.json");
console.log("\n📤 You can now run: node post-jobs.js");
const fs = require("fs");

// Load scraped jobs
function loadJobs() {
  try {
    var data = fs.readFileSync("scraped-jobs.json", "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.log("⚠️ No scraped jobs found.");
    return [];
  }
}

// Format job for Employee Table
function formatJob(job) {
  var formatted = {
    jobRole: job.title || job.jobTitle || "Job Opening",
    companyName: job.companyName || job.organization || "Company",
    workLocation: job.locationCity || job.location || "India",
    jobType: job.employmentType || "Full-Time",
    experience: job.seniority || "Fresher",
    qualification: job.qualification || "Any Graduate",
    package: job.salary || job.jobSalary || "Competitive",
    skills: job.skills ? job.skills.join(", ") : "",
    description: job.descriptionText || job.jobDescription || "",
    applyLink: job.applicationUrl || job.applyUrl || job.jobUrl || "",
    companyLogo: job.companyLogo || "",
    verified: "on"
  };
  return formatted;
}

// Display job
function displayJob(job) {
  console.log("\n📋 Job Details (Copy-Paste to Admin Panel):");
  console.log("========================================");
  console.log("Job Role: " + job.jobRole);
  console.log("Company Name: " + job.companyName);
  console.log("Work Location: " + job.workLocation);
  console.log("Job Type: " + job.jobType);
  console.log("Experience: " + job.experience);
  console.log("Qualification: " + job.qualification);
  console.log("Package: " + job.package);
  console.log("Skills: " + job.skills);
  console.log("Apply Link: " + job.applyLink);
  console.log("Company Logo URL: " + job.companyLogo);
  console.log("\nJob Description:");
  console.log(job.description || "No description provided.");
  console.log("========================================\n");
}

// Main function
function main() {
  console.log("📤 Job Posting Assistant\n");
  
  var jobs = loadJobs();
  
  if (jobs.length === 0) {
    console.log("❌ No jobs found.");
    return;
  }
  
  console.log("📊 Found " + jobs.length + " jobs to process\n");
  
  for (var i = 0; i < jobs.length; i++) {
    var formatted = formatJob(jobs[i]);
    displayJob(formatted);
    console.log("✅ Job ready to copy-paste into Employee Table admin panel");
    console.log("📌 Go to: https://www.employeetable.in/admin\n");
  }
  
  console.log("✅ " + jobs.length + " jobs ready for posting!");
}

main();
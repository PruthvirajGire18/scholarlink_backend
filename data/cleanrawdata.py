import json
from datetime import datetime, date
#source and destination files
INPUT_FILE = "raw_scholarships.json"
OUTPUT_FILE = "meaningful_scholarships.json"

TODAY = date.today()

#convert deadline date to number of days left
def days_left(deadline_str):
    if not deadline_str:
        return None
    deadline = datetime.strptime(deadline_str, "%Y-%m-%d").date()
    return (deadline - TODAY).days

#define urgency level based on days left
def urgency_from_days(days):
    if days is None:
        return "Unknown"
    if days < 0:
        return "Closed"
    if days <= 3:
        return "High"
    if days <= 10:
        return "Medium"
    return "Low"

#read from raw file
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    raw = json.load(f)

#store cleaned scholarship objects
meaningful = []
open_count = verified_count = urgent_count = 0

#looping through each scholarship in raw data 
for s in raw.get("scholarships", []):
    deadline = s.get("deadlineDate")
    days = days_left(deadline)

    status = "Open" if days is not None and days >= 0 else "Closed"
    urgency = urgency_from_days(days)

    if status == "Open":
        open_count += 1
    if s.get("verifiedStatus"):
        verified_count += 1
    if urgency == "High":
        urgent_count += 1

    multilingual = s.get("scholarshipMultilinguals", [])
    primary = multilingual[0] if multilingual else {}

# build a clean readable scholarship object
    meaningful.append({
        "name": s.get("scholarshipName"),
        "type": s.get("oppurtunityType"),
        "deadline": deadline,
        "daysLeft": days,
        "status": status,
        "urgency": urgency,
        "verified": s.get("verifiedStatus"),
        "whoCanApply": primary.get("applicableFor"),
        "reward": primary.get("purposeAward"),
        "applyUrl": f"/{s.get('pageSlug')}"
    })

#processed scholarships
output = {
    "summary": {
        "total": raw.get("total", len(meaningful)),
        "openNow": open_count,
        "verified": verified_count,
        "urgent": urgent_count,
        "generatedOn": TODAY.isoformat()
    },
    "scholarships": meaningful
}

#write to output files
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2)

print("Meaningful JSON written to", OUTPUT_FILE)

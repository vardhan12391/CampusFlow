#!/bin/bash
# CampusFlow full route + logic smoke test.
# Hits every route of the RUNNING dev server with every role (guest / student /
# staff / admin), walks the whole complaint lifecycle, checks the REST API and
# the escalation job, then deletes everything it created.
# Run:  npm start   (in one terminal)
#       npm run smoke   (in another; needs curl + bash, e.g. Git Bash on Windows)
B=http://localhost:3000
PASS=0; FAIL=0

check() { # check <expected> <label> <curl args...>
  local exp="$1"; local label="$2"; shift 2
  local got
  got=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$@")
  if [ "$got" = "$exp" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  FAIL $label -> $got (expected $exp)"; fi
}

checkval() { # checkval <expected> <label> <actual>
  if [ "$3" = "$1" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  FAIL $label -> '$3' (expected '$1')"; fi
}

has() { # has <label> <needle> <curl args...>  (page must CONTAIN needle)
  local label="$1"; local needle="$2"; shift 2
  if curl -s --max-time 10 "$@" | grep -qF "$needle"; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  FAIL $label (page is missing: $needle)"; fi
}

hasnot() { # page must NOT contain needle
  local label="$1"; local needle="$2"; shift 2
  if curl -s --max-time 10 "$@" | grep -qF "$needle"; then FAIL=$((FAIL+1)); echo "  FAIL $label (page should not contain: $needle)"; else PASS=$((PASS+1)); fi
}

loc() { # print Location header of a request
  curl -s -o /dev/null -D - --max-time 10 "$@" | tr -d '\r' | awk 'tolower($1)=="location:" {print $2}' | head -n1
}

login() { # login <jar> <email>
  curl -s -c "$1" -o /dev/null -d "email=$2&password=password123" $B/auth/login
}

# --- gather IDs from the DB (other student's ticket, staff id, open complaint category/location) ---
IDS=$(node -e "
require('dotenv').config();
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('./models/User');
  const Complaint = require('./models/Complaint');
  const rahul = await User.findOne({ email: 'rahul@campusflow.edu' });
  const other = await Complaint.findOne({ reportedBy: { \$ne: rahul._id } }).sort({ ticketId: 1 });
  const open  = await Complaint.findOne({ status: { \$nin: ['Resolved', 'Closed'] } }).sort({ ticketId: 1 });
  const staff = await User.findOne({ email: 'staff@campusflow.edu' });
  if (!rahul || !other || !open || !staff) throw new Error('seed data incomplete');
  console.log([other.ticketId, String(staff._id), open.category, open.location].join('|'));
  await mongoose.disconnect();
})().catch((e) => { console.error('IDS ERROR: ' + e.message); process.exit(1); });
")
if [ -z "$IDS" ]; then echo "FATAL: could not gather test IDs"; exit 1; fi
IFS='|' read -r OTHER_TICKET STAFF_ID OPEN_CAT OPEN_LOC <<< "$IDS"

echo "== GUEST =="
check 200 "GET /"                   $B/
check 200 "GET /auth/login"         $B/auth/login
check 200 "GET /auth/register"      $B/auth/register
check 302 "GET /student"            $B/student
check 302 "GET /staff"              $B/staff
check 302 "GET /admin"              $B/admin
check 302 "GET /complaints/new"     $B/complaints/new
check 302 "GET /complaints/CF-1001" $B/complaints/CF-1001
check 302 "POST comment guest"      -X POST -d "body=hi" $B/complaints/CF-1001/comments
check 401 "GET /api/complaints"     $B/api/complaints
check 404 "GET /nope"               $B/nope
check 302 "GET /complaints/BAD guest -> login" $B/complaints/THIS-IS-NOT-A-TICKET
check 401 "GET /api/nope (auth runs first)" $B/api/nope
has  "login page shows bootstrap css" "bootstrap.min.css" $B/auth/login
has  "login page demo badge fixed"    "rahul@campusflow.edu / password123" $B/auth/login
hasnot "old wrong demo email gone"    "student@campusflow.edu" $B/auth/login
has  "home page links css"           "/css/style.css" $B/

S=jar-student.txt; T=jar-staff.txt; A=jar-admin.txt
login $S rahul@campusflow.edu
login $T staff@campusflow.edu
login $A admin@campusflow.edu

echo "== STUDENT (rahul) =="
check 200 "GET /student"                  -b $S $B/student
check 200 "GET /student/complaints"       -b $S $B/student/complaints
check 200 "GET /complaints/new"           -b $S $B/complaints/new
check 200 "GET /student/complaints?page=2" -b $S "$B/student/complaints?page=2"
check 403 "GET /admin (student)"          -b $S $B/admin
check 403 "GET /staff (student)"          -b $S $B/staff
check 403 "GET /admin/analytics"          -b $S $B/admin/analytics
check 403 "GET other student's complaint" -b $S $B/complaints/$OTHER_TICKET
check 200 "GET /api/complaints"           -b $S $B/api/complaints
check 403 "PATCH /api/complaints (student)" -b $S -X PATCH -H 'Content-Type: application/json' -d '{"priority":"Low"}' $B/api/complaints/CF-1001
check 404 "GET missing ticket (logged in)" -b $S $B/complaints/THIS-IS-NOT-A-TICKET

echo "== STUDENT create flow (validation / duplicate / multer) =="
check 400 "POST /complaints invalid"   -b $S -d "title=&description=&category=&location=&priority=" $B/complaints
check 409 "POST /complaints duplicate" -b $S --data-urlencode "title=Dup test" --data-urlencode "description=x" --data-urlencode "category=$OPEN_CAT" --data-urlencode "location=$OPEN_LOC" --data-urlencode "priority=Low" $B/complaints

printf '\x89PNG\r\n\x1a\n' > tmp-smoke.png
LOC_CREATE=$(loc -b $S -F "title=Smoke test multipart complaint" -F "description=Created by route smoke test - safe to delete" -F "category=Classroom" -F "location=Smoke Test Bench 9" -F "priority=Low" -F "confirmDuplicate=yes" -F "image=@tmp-smoke.png" $B/complaints)
TICKET="${LOC_CREATE##*/}"
case "$TICKET" in CF-*) checkval "/complaints/$TICKET" "POST /complaints redirects to new ticket" "$LOC_CREATE";; *) checkval "/complaints/CF-xxxx" "POST /complaints redirect" "$LOC_CREATE";; esac

check 400 "feedback before resolved" -b $S -X POST -d "rating=5&comment=tooearly" $B/complaints/$TICKET/feedback
check 302 "POST comment"             -b $S --data-urlencode "body=Smoke test comment" $B/complaints/$TICKET/comments
check 403 "student PATCH status"     -b $S --data-urlencode "_method=PATCH" --data-urlencode "status=Closed" $B/complaints/$TICKET/status
check 200 "GET new complaint"        -b $S $B/complaints/$TICKET

echo "== STAFF =="
check 200 "GET /staff"                 -b $T $B/staff
check 200 "GET /staff/complaints"      -b $T $B/staff/complaints
check 200 "GET unassigned pool"        -b $T "$B/staff/complaints?scope=unassigned"
check 403 "GET /admin (staff)"         -b $T $B/admin
check 403 "GET /student (staff)"       -b $T $B/student
check 403 "POST /complaints (staff)"   -b $T -X POST -d "title=x&description=y&category=Hostel&location=H1&priority=Low" $B/complaints
check 200 "staff views student ticket" -b $T $B/complaints/$TICKET
check 302 "staff accepts ticket"       -b $T -X POST $B/complaints/$TICKET/accept
check 400 "accept twice rejected"      -b $T -X POST $B/complaints/$TICKET/accept
check 302 "Assigned -> In Progress"    -b $T --data-urlencode "_method=PATCH" --data-urlencode "status=In Progress" $B/complaints/$TICKET/status
check 302 "In Progress -> Resolved"    -b $T --data-urlencode "_method=PATCH" --data-urlencode "status=Resolved" $B/complaints/$TICKET/status
check 403 "staff cannot close"         -b $T --data-urlencode "_method=PATCH" --data-urlencode "status=Closed" $B/complaints/$TICKET/status

echo "== STUDENT confirm + feedback =="
check 302 "confirm resolution (close)" -b $S -d "action=close" $B/complaints/$TICKET/confirm
check 400 "confirm again rejected"     -b $S -d "action=close" $B/complaints/$TICKET/confirm
check 400 "bogus confirm action"       -b $S -d "action=explode" $B/complaints/$TICKET/confirm
check 302 "submit feedback"            -b $S --data-urlencode "rating=5" --data-urlencode "comment=Smoke test rating" $B/complaints/$TICKET/feedback
has  "success flash rendered"          "Thanks for your feedback!" -b $S $B/complaints/$TICKET
has  "feedback visible on page"        "Smoke test rating" -b $S $B/complaints/$TICKET

echo "== ADMIN =="
check 200 "GET /admin"                  -b $A $B/admin
check 200 "GET /admin/complaints"       -b $A $B/admin/complaints
check 200 "GET search filter"           -b $A "$B/admin/complaints?search=tube"
check 200 "GET status filter"           -b $A "$B/admin/complaints?status=Closed"
check 200 "GET priority+sort"           -b $A "$B/admin/complaints?priority=Urgent&sort=priority"
check 200 "GET escalated filter"        -b $A "$B/admin/complaints?escalated=true"
check 200 "GET unassigned filter"       -b $A "$B/admin/complaints?assignedTo=unassigned"
check 200 "GET page 2"                  -b $A "$B/admin/complaints?page=2"
check 200 "GET /admin/analytics"        -b $A $B/admin/analytics
check 200 "GET /admin/users"            -b $A $B/admin/users
check 200 "GET /admin/users?role=staff" -b $A "$B/admin/users?role=staff"
check 200 "GET /admin/feedback"         -b $A $B/admin/feedback
check 200 "GET complaint (admin)"       -b $A $B/complaints/$TICKET
check 302 "PATCH priority (html form)"  -b $A --data-urlencode "_method=PATCH" --data-urlencode "priority=Urgent" --data-urlencode "redirect=/complaints/$TICKET" $B/complaints/$TICKET/priority
check 302 "PATCH assign"                -b $A --data-urlencode "_method=PATCH" --data-urlencode "assignedTo=$STAFF_ID" $B/complaints/$TICKET/assign
check 400 "PATCH assign bad staff"      -b $A --data-urlencode "_method=PATCH" --data-urlencode "assignedTo=not-an-id" $B/complaints/$TICKET/assign

echo "== ADMIN user management =="
node -e "require('dotenv').config();const m=require('mongoose');m.connect(process.env.MONGODB_URI).then(async()=>{await require('./models/User').deleteOne({email:'smokeuser@campusflow.edu'});process.exit(0)})"
check 400 "POST /admin/users invalid"  -b $A -d "name=&email=nope&password=1" $B/admin/users
U_LOC=$(loc -b $A -d "name=Smoke Test User&email=smokeuser@campusflow.edu&password=password123&role=student&department=Computer Science" $B/admin/users)
checkval "/admin/users" "POST /admin/users redirect" "$U_LOC"
USER_ID=$(node -e "require('dotenv').config();const m=require('mongoose');m.connect(process.env.MONGODB_URI).then(async()=>{const u=await require('./models/User').findOne({email:'smokeuser@campusflow.edu'});console.log(u?String(u._id):'MISSING');process.exit(0)})" | tail -n1)
checkval "24" "temp user id parsed" "${#USER_ID}"
check 302 "PATCH user role"      -b $A --data-urlencode "_method=PATCH" --data-urlencode "role=staff" $B/admin/users/$USER_ID/role
check 400 "change own role blocked" -b $A --data-urlencode "_method=PATCH" --data-urlencode "role=student" "$B/admin/users/$(node -e "require('dotenv').config();const m=require('mongoose');m.connect(process.env.MONGODB_URI).then(async()=>{const a=await require('./models/User').findOne({email:'admin@campusflow.edu'});console.log(String(a._id));process.exit(0)})" | tail -n1)/role"
check 302 "PATCH user status"    -b $A --data-urlencode "_method=PATCH" $B/admin/users/$USER_ID/status
has  "temp user in list" "smokeuser@campusflow.edu" -b $A $B/admin/users

echo "== REST API =="
A_LOC=$(loc -b $S -H 'Content-Type: application/json' -d '{"title":"API smoke complaint","description":"Created by API smoke test","category":"Hostel","location":"API Smoke Zone","priority":"Low"}' $B/api/complaints)
# expect 201 -> curl -D prints Location: /api/complaints/CF-xxxx
API_TICKET="${A_LOC##*/}"
case "$API_TICKET" in CF-*) PASS=$((PASS+1));; *) FAIL=$((FAIL+1)); echo "  FAIL POST /api/complaints Location -> '$A_LOC'";; esac
check 403 "POST /api/complaints (admin)" -b $A -H 'Content-Type: application/json' -d '{"title":"Admin should not create","description":"Admins are forbidden from creating complaints through the API by design.","category":"Hostel","location":"z","priority":"Low"}' $B/api/complaints
check 400 "POST /api/complaints invalid" -b $S -H 'Content-Type: application/json' -d '{"title":""}' $B/api/complaints
check 200 "GET /api/complaints paged"    -b $A "$B/api/complaints?limit=5&page=2"
check 200 "GET /api/complaints/similar"  -b $A "$B/api/complaints/similar?category=$OPEN_CAT&location=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$OPEN_LOC")"
check 200 "GET /api/complaints/:id"      -b $A $B/api/complaints/$API_TICKET
check 404 "GET /api/complaints/missing"  -b $A $B/api/complaints/CF-9999
check 201 "POST api comment"             -b $S -H 'Content-Type: application/json' -d '{"body":"API smoke comment"}' $B/api/complaints/$API_TICKET/comments
check 200 "PATCH api priority (admin)"   -b $A -X PATCH -H 'Content-Type: application/json' -d '{"priority":"Urgent"}' $B/api/complaints/$API_TICKET
check 200 "PATCH api status (admin)"     -b $A -X PATCH -H 'Content-Type: application/json' -d '{"status":"Assigned"}' $B/api/complaints/$API_TICKET
check 403 "PATCH api status (staff not assigned)" -b $T -X PATCH -H 'Content-Type: application/json' -d '{"status":"Resolved"}' $B/api/complaints/$API_TICKET
check 403 "DELETE api (student)"         -b $S -X DELETE $B/api/complaints/$API_TICKET
check 403 "DELETE api (staff)"           -b $T -X DELETE $B/api/complaints/$API_TICKET

echo "== AUTH FLOW =="
check 302 "POST /auth/login (correct)"  -c jar-x.txt -d "email=admin@campusflow.edu&password=password123" $B/auth/login
check 401 "POST /auth/login (wrong pw)" -c jar-y.txt -d "email=admin@campusflow.edu&password=nope" $B/auth/login
check 403 "POST /auth/login (inactive)" -c jar-z.txt -d "email=smokeuser@campusflow.edu&password=password123" $B/auth/login
check 400 "POST /auth/register (bad)"   -d "name=&email=bad&password=123" $B/auth/register
rm -f jar-x.txt jar-y.txt jar-z.txt

echo "== ESCALATION LOGIC =="
ESC=$(curl -s -b $A "$B/api/complaints?limit=100" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.data.filter(c=>c.isEscalated).length)})")
if [ "$ESC" -ge 1 ] 2>/dev/null; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "  FAIL escalation: expected >=1 escalated complaint, got '$ESC'"; fi

echo "== CLEANUP =="
check 200 "DELETE api complaint (admin)" -b $A -X DELETE $B/api/complaints/$API_TICKET
check 200 "DELETE html complaint (admin)" -b $A -X DELETE $B/api/complaints/$TICKET
node -e "require('dotenv').config();const m=require('mongoose');m.connect(process.env.MONGODB_URI).then(async()=>{const r=await require('./models/User').deleteOne({email:'smokeuser@campusflow.edu'});console.log('temp user removed:',r.deletedCount);process.exit(0)})"
rm -f tmp-smoke.png
check 302 "POST /auth/logout" -b $A -X POST $B/auth/logout

echo
echo "PASS=$PASS FAIL=$FAIL"
rm -f jar-*.txt
[ "$FAIL" -eq 0 ]

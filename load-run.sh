#!/bin/bash

START=1					#Number to start loop with
END=3	 				#Number to stop at
delay=0.001	 			#Delay in seconds
IP="127.0.0.1"		#IP address to run load test on
topic="test2"			#Topic ID
subscode="8yp45s-c0d3"	#Usually 8yp45s-c0d3, which is leet for bypass-code
emailPrefix="bonjour"	#Email prefix that will have an incremented number appended to

echo "Start load test"
start=$(date +"%s")
for (( i=$START; i<=$END; i++ ))
do
	emailAddress=$emailPrefix$i@test.ca

	email='{"eml": "'"$emailAddress"'", "tid": "'"$topic"'"}'

	# Subscribe through JSON end point
	#response=$( curl -s -i -X POST -H 'Content-Type: application/json' -d "$email" http://$IP:8080/api/v0.1/subs/email/add )
	response=(${response[@]}) # convert to array
	body=${response[-1]} # last item contain the subscode

	echo $emailAddress

	sleep $delay

	confirm=$( curl -s -i -X GET http://$IP:8080/subs/confirm/$body )
done

echo "End load test"
echo $start
endTime=$(date +"%s")
echo $endTime
echo it took $(( $endTime - $start ))
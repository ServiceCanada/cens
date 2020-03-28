#!/bin/bash

START=1					#Number to start loop with
END=3	 				#Number to stop at
delay=0.001	 			#Delay in seconds
IP="192.168.2.71"		#IP address to run load test on
topic="test2"			#Topic ID
subscode="8yp45s-c0d3"	#Usually 8yp45s-c0d3, which is leet for bypass-code
emailPrefix="bonjour"	#Email prefix that will have an incremented number appended to

for (( i=$START; i<=$END; i++ ))
do
	email='{"eml": "'"$emailPrefix""$i"'@loadtest.gc.ca", "tid": "'"$topic"'"}'
	curl -i -X POST -H 'Content-Type: application/json' -d "$email" http://$IP:8080/api/v0.1/subs/email/add
	sleep $delay
	curl -i -X GET http://$IP:8080/subs/confirm/$subscode/$emailPrefix$i@loadtest.gc.ca
done
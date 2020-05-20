# Docker exec script

To be ran in a terminal at the root of the project.

## First run

Add a test topic in mongo

```
docker exec -i x-notify-mongo /bin/bash -c mongo < docker/first-run-insert-topic-test.js
```
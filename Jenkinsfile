pipiline{
    agent{label 'student-node'}
    stage{
        stage('build docker image'){
            steps{
                bat 'docker build -t student-backend:v1'
            }
        }
        stage('docker tag'){
            steps{
                bat 'docker tag student-backend:v1 kane2404/student-backend:v1'
            }
        }
        stage('docker push'){
            steps{
                bat 'docker push kane2404/student-backend:v1'
            }
        }
    }

}
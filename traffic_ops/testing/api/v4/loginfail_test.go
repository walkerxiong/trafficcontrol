package v4

/*

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

import (
	"crypto/tls"
	"net/http"
	"net/http/cookiejar"
	"testing"
	"time"

	"golang.org/x/net/publicsuffix"

	client "github.com/apache/trafficcontrol/traffic_ops/v4-client"
	toclient "github.com/apache/trafficcontrol/traffic_ops/v4-client"
)

func TestLoginFail(t *testing.T) {
	WithObjs(t, []TCObj{CDNs}, func() {
		PostTestLoginFail(t)
		LoginWithEmptyCredentialsTest(t)
	})
	WithObjs(t, []TCObj{Roles, Tenants, Users}, func() {
		LoginWithTokenTest(t)
	})
}

func PostTestLoginFail(t *testing.T) {
	// This specifically tests a previous bug: auth failure returning a 200, causing the client to think the request succeeded, and deserialize no matching fields successfully, and return an empty object.

	userAgent := "to-api-v3-client-tests-loginfailtest"
	uninitializedTOClient, err := getUninitializedTOClient(Config.TrafficOps.Users.Admin, Config.TrafficOps.UserPassword, Config.TrafficOps.URL, userAgent, time.Second*time.Duration(Config.Default.Session.TimeoutInSecs))
	if err != nil {
		t.Fatalf("getting uninitialized client: %+v", err)
	}

	if len(testData.CDNs) < 1 {
		t.Fatal("cannot test login: must have at least 1 test data cdn")
	}
	expectedCDN := testData.CDNs[0]
	opts := client.NewRequestOptions()
	opts.QueryParameters.Set("name", expectedCDN.Name)
	actualCDNs, _, err := uninitializedTOClient.GetCDNs(opts)
	if err != nil {
		t.Fatalf("failed to request CDN '%s': %v - alerts: %+v", expectedCDN.Name, err, actualCDNs.Alerts)
	}
	if len(actualCDNs.Response) < 1 {
		t.Fatal("uninitialized client should have retried login (possibly login failed with a 200, so it didn't try again, and the CDN request returned an auth failure with a 200, which the client reasonably thought was success, and deserialized with no matching keys, resulting in an empty object); len(actualCDNs) expected >1, actual 0")
	}
	actualCDN := actualCDNs.Response[0]
	if expectedCDN.Name != actualCDN.Name {
		t.Fatalf("cdn.Name expected '%s' actual '%s'", expectedCDN.Name, actualCDN.Name)
	}
}

func LoginWithEmptyCredentialsTest(t *testing.T) {
	userAgent := "to-api-v4-client-tests-loginfailtest"
	_, _, err := toclient.LoginWithAgent(Config.TrafficOps.URL, Config.TrafficOps.Users.Admin, "", true, userAgent, false, time.Second*time.Duration(Config.Default.Session.TimeoutInSecs))
	if err == nil {
		t.Fatal("expected error when logging in with empty credentials, actual nil")
	}
}

func LoginWithTokenTest(t *testing.T) {
	db, err := OpenConnection()
	if err != nil {
		t.Fatalf("Failed to get database connection: %v", err)
	}

	allowedToken := "test"
	disallowedToken := "quest"

	if _, err = db.Exec(`UPDATE tm_user SET token=$1 WHERE id = (SELECT id FROM tm_user WHERE role != (SELECT id FROM role WHERE name='disallowed') LIMIT 1)`, allowedToken); err != nil {
		t.Fatalf("Failed to set allowed token: %v", err)
	}

	if _, err = db.Exec(`UPDATE tm_user SET token=$1 WHERE id = (SELECT id FROM tm_user WHERE role = (SELECT id FROM role WHERE name='disallowed') LIMIT 1)`, disallowedToken); err != nil {
		t.Fatalf("Failed to set disallowed token: %v", err)
	}

	userAgent := "to-api-v3-client-tests-loginfailtest"
	s, _, err := toclient.LoginWithToken(Config.TrafficOps.URL, allowedToken, true, userAgent, false, time.Second*time.Duration(Config.Default.Session.TimeoutInSecs))
	if err != nil {
		t.Errorf("unexpected error when logging in with a token: %v", err)
	}
	if s == nil {
		t.Error("returned client was nil")
	}

	// disallowed token
	_, _, err = toclient.LoginWithToken(Config.TrafficOps.URL, disallowedToken, true, userAgent, false, time.Second*time.Duration(Config.Default.Session.TimeoutInSecs))
	if err == nil {
		t.Error("expected an error when logging in with a disallowed token, actual nil")
	}

	// nonexistent token
	_, _, err = toclient.LoginWithToken(Config.TrafficOps.URL, "notarealtoken", true, userAgent, false, time.Second*time.Duration(Config.Default.Session.TimeoutInSecs))
	if err == nil {
		t.Error("expected an error when logging in with a nonexistent token, actual nil")
	}
}

func getUninitializedTOClient(user, pass, uri, agent string, reqTimeout time.Duration) (*toclient.Session, error) {
	insecure := true
	useCache := false
	jar, err := cookiejar.New(&cookiejar.Options{
		PublicSuffixList: publicsuffix.List,
	})
	if err != nil {
		return nil, err
	}
	return toclient.NewSession(user, pass, uri, agent, &http.Client{
		Timeout: reqTimeout,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: insecure},
		},
		Jar: jar,
	}, useCache), nil
}

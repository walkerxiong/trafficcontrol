/*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import { Component, OnInit } from "@angular/core";
import { FormControl } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { faBroom } from "@fortawesome/free-solid-svg-icons";

import { Subject } from "rxjs";

import { DataPoint, DataSet, DeliveryService } from "../../models";
import { DeliveryServiceService } from "../../shared/api";
import {AlertService} from "../../shared/alert/alert.service";

/**
 * DeliveryserviceComponent is the controller for a single Delivery Service's
 * details page.
 */
@Component({
	selector: "tp-deliveryservice",
	styleUrls: ["./deliveryservice.component.scss"],
	templateUrl: "./deliveryservice.component.html"
})
export class DeliveryserviceComponent implements OnInit {

	/** The Delivery Service described by this component. */
	public deliveryservice = {} as DeliveryService;

	/** A map of the names of charts to whether or not they've been loaded. */
	public loaded = new Map([["main", false], ["bandwidth", false]]);

	/** Data for the bandwidth chart. */
	public bandwidthData: Subject<Array<DataSet>>;

	/** Data for the transactions per second chart. */
	public tpsChartData: Subject<Array<DataSet>>;

	/** Bandwidth data at the Edge-tier level. */
	private readonly edgeBandwidth: DataSet;
	/** Bandwidth data at the Mid-tier level. */
	private readonly midBandwidth: DataSet;

	/** Icon for the content invalidation FAB. */
	public readonly invalidateIcon=faBroom;

	/** End date for charts. */
	private to: Date = new Date();
	/** Start date for charts. */
	private from: Date = new Date();

	/**
	 * Form controller for the user's date selector for the end of the time
	 * range.
	 */
	public fromDate: FormControl = new FormControl();

	/**
	 * Form controller for the user's time selector for the end of the time
	 * range.
	 */
	public fromTime: FormControl = new FormControl();

	/**
	 * Form controller for the user's date selector for the beginning of the
	 * time range.
	 */
	public toDate: FormControl = new FormControl();

	/**
	 * Form controller for the user's date selector for the beginning of the
	 * time range.
	 */
	public toTime: FormControl = new FormControl();

	/** The size of each single interval for data grouping, in seconds. */
	private bucketSize = 300;

	/**
	 * Constructor.
	 */
	constructor(
		private readonly route: ActivatedRoute,
		private readonly api: DeliveryServiceService,
		private readonly alerts: AlertService
	) {
		this.midBandwidth = {
			backgroundColor: "#3CBA9F",
			borderColor: "#3CBA9F",
			data: new Array<DataPoint>(),
			fill: false,
			label: "Mid-Tier"
		};

		this.edgeBandwidth = {
			backgroundColor: "#BA3C57",
			borderColor: "#BA3C57",
			data: new Array<DataPoint>(),
			fill: false,
			label: "Edge-Tier"
		};

		this.bandwidthData = new Subject<Array<DataSet>>();
		this.tpsChartData = new Subject<Array<DataSet>>();
	}

	/**
	 * Runs initialization, including setting up date/time range controls and
	 * fetching data.
	 */
	public ngOnInit(): void {
		const DSID = this.route.snapshot.paramMap.get("id");
		if (!DSID) {
			console.error("Missing route 'id' parameter");
			return;
		}

		this.to.setUTCMilliseconds(0);
		this.from = new Date(this.to.getFullYear(), this.to.getMonth(), this.to.getDate());

		const dateStr = String(this.from.getFullYear()).padStart(4, "0").concat(
			"-", String(this.from.getMonth() + 1).padStart(2, "0").concat(
				"-", String(this.from.getDate()).padStart(2, "0")));

		this.fromDate = new FormControl(dateStr);
		this.fromTime = new FormControl("00:00");
		this.toDate = new FormControl(dateStr);
		const timeStr = String(this.to.getHours()).padStart(2, "0").concat(":", String(this.to.getMinutes()).padStart(2, "0"));
		this.toTime = new FormControl(timeStr);

		this.api.getDeliveryServices(parseInt(DSID, 10)).then(
			d => {
				this.deliveryservice = d;
				this.loaded.set("main", true);
				this.loadBandwidth();
				this.loadTPS();
			}
		);
	}

	/**
	 * Runs when a new date/time range is selected by the user, updating the
	 * chart data accordingly.
	 */
	public newDateRange(): void {
		this.to = new Date(this.toDate.value.concat("T", this.toTime.value));
		this.from = new Date(this.fromDate.value.concat("T", this.fromTime.value));

		// I need to set these explicitly, just in case - the API can't handle millisecond precision
		this.to.setUTCMilliseconds(0);
		this.from.setUTCMilliseconds(0);

		// This should set it to the number of seconds needed to bucket 500 datapoints
		this.bucketSize = (this.to.getTime() - this.from.getTime()) / 30000000;
		this.loadBandwidth();
		this.loadTPS();
	}

	/**
	 * Loads new data for the bandwidth chart.
	 */
	private loadBandwidth(): void {
		let interval: string;
		if (this.bucketSize < 1) {
			interval = "1m";
		} else {
			interval = `${Math.round(this.bucketSize)}m`;
		}

		const xmlID = this.deliveryservice.xmlId;

		// Edge-tier data
		this.api.getDSKBPS(xmlID, this.from, this.to, interval, false).then(
			data => {
				const va = new Array<DataPoint>();
				for (const v of data.series.values) {
					if (v[1] === null) {
						continue;
					}
					va.push({t: new Date(v[0]), y: v[1]} as DataPoint);
				}
				this.edgeBandwidth.data = va;
				this.bandwidthData.next([this.edgeBandwidth, this.midBandwidth]);
			},
			e => {
				this.alerts.newAlert("warning", "Edge-Tier bandwidth data not found!");
				console.error(`Failed to get edge KBPS data for '${xmlID}':`, e);
			}
		);

		// Mid-tier data
		this.api.getDSKBPS(this.deliveryservice.xmlId, this.from, this.to, interval, true).then(
			data => {
				const va = new Array<DataPoint>();
				for (const v of data.series.values) {
					if (v[1] === null) {
						continue;
					}
					va.push({t: new Date(v[0]), y: v[1]} as DataPoint);
				}
				this.midBandwidth.data = va;
				this.bandwidthData.next([this.edgeBandwidth, this.midBandwidth]);
			},
			e => {
				this.alerts.newAlert("warning", "Mid-Tier bandwidth data not found!");
				console.error(`Failed to get mid KBPS data for '${xmlID}':`, e);
			}
		);
	}

	/**
	 * Loads new data for the TPS chart.
	 */
	private loadTPS(): void {
		let interval: string;
		if (this.bucketSize < 1) {
			interval = "1m";
		} else {
			interval = `${Math.round(this.bucketSize)}m`;
		}

		this.api.getAllDSTPSData(this.deliveryservice.xmlId, this.from, this.to, interval, false).then(
			data => {
				data.total.dataSet.label = "Total";
				data.total.dataSet.borderColor = "#3C96BA";
				data.success.dataSet.label = "Successful Responses";
				data.success.dataSet.borderColor = "#3CBA5F";
				data.redirection.dataSet.label = "Redirection Responses";
				data.redirection.dataSet.borderColor = "#9f3CBA";
				data.clientError.dataSet.label = "Client Error Responses";
				data.clientError.dataSet.borderColor = "#BA9E3B";
				data.serverError.dataSet.label = "Server Error Responses";
				data.serverError.dataSet.borderColor = "#BA3C57";

				this.tpsChartData.next([
					data.total.dataSet,
					data.success.dataSet,
					data.redirection.dataSet,
					data.clientError.dataSet,
					data.serverError.dataSet
				]);
			},
			e => {
				console.error(`Failed to get edge TPS data for '${this.deliveryservice.xmlId}':`, e);
				this.alerts.newAlert("warning", "Edge-Tier transaction data not found!");
			}
		);
	}

}
